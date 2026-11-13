// Kept walk for docs/issues/U09-A18-picture-over-request-limit-server-error.md, spec U48 A26:
// a Body Text larger than the server accepts in one request (post_max_size, 8M) fails on "Save".
// OJS only (no other app has the Body Text page; 3.5 has none). Runs on a dataset fleet (PKP's default
// test dataset), freshly reset before each run, as the report's Steps say:
//   MODE=walk (default)  the Steps: dbarnes, submission 9, "Body Text", ~9 MB pasted, "Save", the window,
//                        "Export" › "Export to HTML", the reload.
//   MODE=nb              the neighbour, alone: the same with ~3 MB (over upload_max_filesize, under
//                        post_max_size), "Save", the reload.
// Run: PROBE_FEATURE=<feature> PROBE_AGENT=<id> [MODE=nb] node bin/probe.js ojs \
//        shared/playwright/checks/issues/body-text-over-request-limit-server-error/walk.js
// The fix: node bin/try-fix.js apply shared/playwright/checks/issues/picture-over-request-limit-server-error/fix.diff ojs
const {forEachApp, launch, signIn, screen, shot, record, idle, sql, serverLog} = require('../../../probe');
const {flat, sleep, bigText, pasteInto, takeErrorWindow, answerOf} = require('./lib');

const MODE = (process.env.MODE || 'walk').toLowerCase();

forEachApp(async (app) => {
    if (app.name !== 'ojs') return;
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset)');
    const {expect} = require('@playwright/test');
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {BodyTextPage} = require('../../../pages/JatsBodyTextPages.js');
    const ctx = app.contextPath;
    const facts = {app: app.name, mode: MODE, steps: {}};
    const fact = (k, v) => {
        facts.steps[k] = v;
        console.log(`[fact] ${k}: ${flat(JSON.stringify(v), 1000)}`);
    };
    const snap = async (page, name) => {
        const s = await screen(page);
        record(`${MODE}-${name}`, s);
        await shot(page, `${MODE}-${name}`).catch(() => {});
        return s;
    };
    const log = serverLog(app);
    const {page, close} = await launch(app);
    try {
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {origin: new URL(app.url('/')).origin});
        const sub = 9;
        const pubId = Number(sql(app, `select current_publication_id from submissions where submission_id = ${sub}`));
        // the stored Body Text: SubmissionFile::SUBMISSION_FILE_BODY_TEXT (22) on the publication
        const bodyTextRows = () => Number(sql(app, `select count(*) from submission_files where file_stage = 22 and assoc_id = ${pubId}`));
        const frame = new WorkflowPage(page, ctx);
        const body = new BodyTextPage(page, frame);

        // 1. sign in
        await signIn(page, 'dbarnes', {contextPath: ctx});
        // 2. the workflow of submission 9, by address
        await frame.gotoEditorial(sub);
        // 3. side menu › "Body Text"
        await body.openFromMenu();
        fact('3 Body Text', {title: flat(await frame.heading().innerText().catch(() => null), 80), editorChars: (await body.editorText()).length,
            unsaved: await body.unsavedBadge().isVisible().catch(() => null), bodyTextRows: bodyTextRows(), notices: (await snap(page, '3-bodytext')).notices});

        // 4. paste
        const lines = MODE === 'nb' ? 300 : 900;
        const text = bigText(lines);
        await pasteInto(page, body.editor(), text);
        await expect.poll(async () => body.paragraphs().count(), {timeout: 120_000}).toBeGreaterThan(lines - 10).catch(() => {});
        fact('4 pasted', {textBytes: Buffer.byteLength(text), paragraphs: await body.paragraphs().count(), unsaved: await body.unsavedBadge().isVisible().catch(() => null)});

        // 5. "Save"
        const from = log.mark();
        const labels = [];
        const save = await answerOf(page, /\/bodyText(\?|$)/, async () => {
            await body.saveButton().click();
            for (let i = 0; i < 6; i++) { labels.push(flat(await body.saveButton().innerText().catch(() => null), 20)); await sleep(150); }
        });
        await sleep(800);
        const s5 = await snap(page, '5-save');
        // 6. the window, "OK"
        const window6 = await takeErrorWindow(page);
        fact('5-6 Save', {...save, labels: [...new Set(labels)], window: window6, unsavedAfter: await body.unsavedBadge().isVisible().catch(() => null),
            bodyTextRows: bodyTextRows(), notices: s5.notices, serverLog: log.since(from).map((l) => flat(l, 400)).slice(0, 6)});

        // 7. "Export" › "Export to HTML" (the Steps' walk only)
        if (MODE === 'walk') {
            const from7 = log.mark();
            await page.getByRole('button', {name: 'Export', exact: true}).click();
            const item = page.getByRole('menuitem', {name: 'Export to HTML'});
            await expect(item).toBeVisible({timeout: 30_000});
            const exp = await answerOf(page, /\/bodyText(\?|$)/, async () => item.click());
            await sleep(800);
            const s7 = await snap(page, '7-export');
            const window7 = await takeErrorWindow(page);
            fact('7 Export to HTML', {...exp, window: window7, galleys: sql(app, `select label from publication_galleys where publication_id = ${pubId} order by galley_id`),
                notices: s7.notices, serverLog: log.since(from7).map((l) => flat(l, 400)).slice(0, 6)});
        }

        // 8. reload
        await body.reload();
        await idle(page);
        const s8 = await snap(page, '8-reloaded');
        fact('8 reloaded', {editorChars: (await body.editorText()).length, paragraphs: await body.paragraphs().count(),
            unsaved: await body.unsavedBadge().isVisible().catch(() => null), bodyTextRows: bodyTextRows(), notices: s8.notices});
    } catch (e) {
        facts.error = flat(e.stack || e.message, 1200);
        await snap(page, 'error').catch(() => {});
        console.log(`[error] ${facts.error}`);
    } finally {
        record(`facts-${MODE}`, facts);
        await close();
    }
});
