// Regression check — pkp/pkp-lib#13637 "Revise/fix galley file revision policies" (Alec Smecher, 2026-10-27):
// pkp-lib df42984b46, OJS c51c5caf1d, OPS ff72e607ef on main (PRs pkp/pkp-lib#13641, pkp/ojs#5994, pkp/ops#1465);
// pkp-lib a6ed3df00a, OJS dce1f05be5, OPS ef55e33bcd on stable-3_5_0 (#13640, #5993, #1464). OJS's and OPS's PublicationRepository::version() now give each new version's
// galley its own submission-file row (a clone that shares the file on disk) and clone its dependent files,
// through Repo::submissionFile()->add(), which logs `submission.event.fileUploaded` on the copy and
// `submission.event.fileRevised` on the submission. The report is docs/reports/2026-10-28-pkp-lib-13637.md.
//
// What it does, per app. On a dataset fleet (PKP's default test dataset) it takes the report's Steps as written:
// `dbarnes` on the published OJS 17 / OPS 2 / OMP 14 of `publicknowledge`. On a campaign fleet it seeds a scratch
// context of its own instead: a submission with a galley "PDF" (OMP: a publication format "PDF") that is published
// (OJS, OMP) or posted (OPS), by the `published` seed key on main and through the screens on 3.5 ("Schedule For
// Publication" › "Select Issue" › "Publish"; OPS "Post"), as the key is main-only; the actor is its manager
// Mia Manager. Then: the Activity Log read on screen and the `event_log` rows by SQL (the control, before the
// press), "Create New Version" through the screens (main: the dialog's preselected stage and "Minor Revision",
// Confirm; 3.5: "Yes"), and the same two reads again, with the proof-stage submission_files rows and the galleys'
// (formats') rows. It asserts nothing; it records and prints a verdict line.
//
//   npm run fleet-prep -- --feature <f> --dataset <n> --reset --apps ojs,ops      # before every run: it adds a version
//   PROBE_FEATURE=<f> PKP_E2E_DATASET=<n> PROBE_AGENT=<id> [PROBE_RUN=<run>] \
//     node bin/probe.js <ojs|ops|omp> shared/playwright/checks/sync/pkp-lib-13637/version-log.js
//   PKP_E2E_LINE=stable-3_5_0 in front of both: the same on the 3.5 line (ojs|ops; OMP is not driven there).
// Without --dataset / PKP_E2E_DATASET it runs on any campaign fleet with a probe server (`npm run fleet-prep --
// --feature <f> --apps <app>`): every run seeds a fresh scratch context, so a fleet already up needs no reset.
// The fix: `node bin/try-fix.js apply shared/playwright/checks/sync/pkp-lib-13637/fix.diff ops` (fix-ojs.diff ojs,
// fix-omp.diff omp), the run, then `revert` with the same arguments.
// Verdict line: `logs-upload` (the regression), `fixed`, `no-copy` (no file row added: the pre-change shape),
// `no-version` (the press did not answer 200).
//
// Reads fixed when: the rows "Create New Version" adds are the version's own ("publication.event.versionCreated",
// "submission.event.general.metadataUpdated") and no `submission.event.fileUploaded` / `fileRevised` row; the
// Activity Log shows "A new version was created." and no new "Revision "<file>" was uploaded for file <n>." line;
// and (OJS, OPS) the new galley still points at a submission file of its own that shares the old file_id.
// At the tips (main 2026-10-28 and 3.5): two more rows, "submission.event.fileUploaded" on the copy and
// "submission.event.fileRevised" on the submission, by the manager, shown as
// `Daniel Barnes | Revision "article.pdf" was uploaded for file 46.` (OJS 17 on the dataset; OPS 2 names its PDF).
// Before the change (OJS c51c5caf1d^, OPS ff72e607ef^, read as code): the new galley reused the old submission
// file, so no copy and no file rows. OMP has always copied its formats' files through add() and logs the same rows: verdict `logs-upload`
// there too, not a regression.
//
// Facts: version-log[-<PROBE_RUN>]-<app>.json; the two Activity Log reads
// version-log-{before,after}[-<PROBE_RUN>]-<app>.{json,png}.
const {forEachApp, launch, signIn, screen, shot, record, idle, tag, sql, serverLog} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 300) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

forEachApp(async (app) => {
    const L35 = app.line === 'stable-3_5_0';
    const isOJS = app.name === 'ojs', isOPS = app.name === 'ops', isOMP = app.name === 'omp';
    const out = {line: app.line || 'main', app: app.name};
    const fact = (k, v) => { out[k] = v; record('version-log', {[k]: v}, {merge: true}); console.log(`[13637] ${app.name} ${k} ${JSON.stringify(v).slice(0, 1500)}`); };
    if (L35 && isOMP) { fact('skipped', 'OMP is not driven on 3.5 (its versioning never changed)'); return; }


    // On a dataset fleet (PKP's default test dataset): the report's Steps as written, `dbarnes` on the published
    // OJS 17 / OPS 2 / OMP 14 of `publicknowledge`; reload the dataset (`fleet-prep … --dataset <n> --reset`)
    // before each run, as every run adds a version.
    const DS = !!app.dataset;
    const DS_SUB = {ojs: 17, ops: 2, omp: 14};
    let C, s, actor;
    if (DS) {
        C = app.contextPath;
        const id = DS_SUB[app.name];
        s = {id, pub: Number(sql(app, `select current_publication_id from submissions where submission_id=${id}`))};
        actor = 'dbarnes';
        fact('seed', {dataset: app.dataset, context: C, submission: s, title: sql(app, `select setting_value from publication_settings where publication_id=${s.pub} and setting_name='title' and locale='en'`)});
    } else {
        const t = tag('v637');
        const ctxSpec = {tag: t, context: {name: `V13637 ${t}`, acronym: 'V637', contactName: 'V Contact', contactEmail: `${t}c@mail.test`},
            users: [{username: `${t}mg`, roles: ['manager'], givenName: 'Mia', familyName: 'Manager'},
                {username: `${t}au`, roles: ['author'], givenName: 'Ari', familyName: 'Author'}]};
        if (isOJS) ctxSpec.issues = [{volume: 1, number: 1, year: 2026, published: true}];
        const ctx = await app.api.createContext(ctxSpec);
        C = ctx.path || t;
        actor = `${t}mg`;
        const FILE = isOPS ? 'preprint.pdf' : 'article.pdf';
        const spec = {tag: `${t}s`, context: C, submitter: `${t}au`, title: `V13637 ${t}`};
        if (isOMP) spec.publicationFormats = [{name: 'PDF', file: FILE}];
        else spec.galleys = [{label: 'PDF', file: FILE}];
        if (!L35) { spec.published = true; if (isOJS) spec.issue = {volume: 1, number: 1, year: 2026}; }
        else if (isOJS) { spec.files = [{file: FILE}]; spec.decisions = ['skipExternalReview', 'sendToProduction']; }
        const r = await app.api.createSubmission(spec);
        s = {id: r.submissionId, pub: r.publicationId};
        fact('seed', {context: C, submission: s, galleys: r.galleys || null, formats: r.publicationFormats || null});
    }

    const logRows = () => sql(app, `select e.log_id || '|' || e.assoc_type || '|' || e.assoc_id || '|' || e.message || '|' || coalesce(u.username,'')
        from event_log e left join users u on u.user_id=e.user_id
        where (e.assoc_type=1048585 and e.assoc_id=${s.id})
           or (e.assoc_type=515 and e.assoc_id in (select submission_file_id from submission_files where submission_id=${s.id}))
        order by e.log_id`).split('\n').filter(Boolean);
    const proofFiles = () => sql(app, `select submission_file_id || '|' || file_id || '|' || assoc_type || '|' || assoc_id || '|' || coalesce(uploader_user_id::text,'')
        from submission_files where submission_id=${s.id} and file_stage=10 order by 1`).split('\n').filter(Boolean);
    const representations = () => (isOMP
        ? sql(app, `select f.publication_format_id || '|' || f.publication_id from publication_formats f join publications p on p.publication_id=f.publication_id where p.submission_id=${s.id} order by 1`)
        : sql(app, `select g.galley_id || '|' || g.publication_id || '|' || coalesce(g.submission_file_id::text,'') from publication_galleys g join publications p on p.publication_id=g.publication_id where p.submission_id=${s.id} order by 1`)
    ).split('\n').filter(Boolean);

    const wfUrl = (key) => app.url(`/index.php/${C}/dashboard/editorial?workflowSubmissionId=${s.id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const pk = (k, pub = s.pub) => (L35 ? `publication_${k}` : `publication_${pub}_${k}`);
    const controls = () => page.locator('[data-cy="workflow-controls-right"]');
    const vis = '[role="dialog"]:visible';
    const log = serverLog(app);
    let page;

    /** The Activity Log as the manager reads it: the workflow header's "Activity Log" (from the "Galleys" page on
     *  3.5, whose scratch-server "Title & Abstract" answers 500 on OPS: a null section word limit). */
    const readActivityLog = async (name) => {
        await page.goto(wfUrl(pk(L35 ? (isOPS ? 'galleys' : 'titleAbstract') : 'titleAbstract', s.pub))); await idle(page);
        const btn = page.getByRole('button', {name: 'Activity Log', exact: true}).first();
        await btn.waitFor({timeout: T});
        await btn.click(); await idle(page);
        const dlg = page.locator(vis).filter({hasText: 'Activity Log'}).last();
        await dlg.locator('tbody tr td').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page); await sleep(600);
        const rows = await dlg.locator('tbody tr').evaluateAll((els) => els
            .filter((tr) => tr.querySelectorAll('td').length > 1)
            .map((tr) => [...tr.querySelectorAll('td')].slice(0, 3).map((td) => (td.innerText || '').trim().replace(/\s+/g, ' ').replace(/^Settings /, '')).join(' | ')))
            .catch(() => []);
        let sc = null; try { sc = await screen(page); } catch (e) { sc = {error: String(e.message)}; }
        record(`version-log-${name}`, {rows, screen: sc});
        await shot(page, `version-log-${name}`).catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
        return rows;
    };

    /** 3.5: publish (OJS, through "Select Issue") or post (OPS) through the screens. */
    const publishOn35 = async () => {
        await page.goto(wfUrl(pk(isOPS ? 'galleys' : 'titleAbstract'))); await idle(page); await sleep(800);
        const res = {};
        if (isOPS) {
            const post = page.getByRole('button', {name: 'Post', exact: true}).first();
            await post.waitFor({timeout: T}); await post.click();
            const conf = page.getByRole('dialog').filter({hasText: 'Are you sure you want to post this?'});
            await conf.waitFor({timeout: T});
            const pr = page.waitForResponse((x) => /\/publish/.test(x.url()), {timeout: T}).catch(() => null);
            await conf.getByRole('button', {name: 'Post', exact: true}).last().click();
            res.status = (await pr)?.status() ?? null;
        } else {
            const btn = page.getByRole('button', {name: 'Schedule For Publication', exact: true}).first();
            await btn.waitFor({timeout: T}); await btn.click(); await idle(page); await sleep(800);
            // "Select Issue": the issue select, then "Save"
            const sel = page.locator('select[name="issueId"]:visible').first();
            await sel.waitFor({timeout: T});
            const opt = sel.locator('option').filter({hasText: /Vol\.? 1 No\.? 1/});
            await sel.selectOption((await opt.first().getAttribute('value')) || '');
            await page.locator(vis).filter({has: sel}).last().getByRole('button', {name: 'Save', exact: true}).click();
            await idle(page); await sleep(1200);
            // "Schedule For Publication": the publish form's "Publish"
            const pub = page.locator(vis).getByRole('button', {name: 'Publish', exact: true}).last();
            await pub.waitFor({timeout: T});
            res.window = flat(await page.locator(vis).last().innerText().catch(() => ''), 400);
            const pr = page.waitForResponse((x) => /\/publish/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await pub.click();
            res.status = (await pr)?.status() ?? null;
        }
        await sleep(1500); await idle(page);
        res.statusDb = sql(app, `select status from publications where publication_id=${s.pub}`);
        return res;
    };

    const {page: p, close} = await launch(app);
    page = p;
    try {
        await signIn(page, actor, {contextPath: C}); await idle(page);
        if (L35 && !DS) fact('publishedOnScreen', await publishOn35());
        fact('statusBefore', sql(app, `select status from publications where publication_id=${s.pub}`));

        // The control: the log before the press
        const before = logRows();
        fact('before', {eventLog: before, proofFiles: proofFiles(), representations: representations(), activityLog: await readActivityLog('before')});

        // "Create New Version"
        await page.goto(wfUrl(pk(L35 && isOPS ? 'galleys' : 'titleAbstract'))); await idle(page); await sleep(800);
        const scope = page.locator(vis).first();
        const create = scope.getByRole('button', {name: 'Create New Version', exact: true})
            .or(scope.getByRole('link', {name: 'Create New Version', exact: true})).first();
        await create.waitFor({state: 'visible', timeout: 20000});
        const from = log.mark();
        const vr = page.waitForResponse((x) => /\/publications\/\d+\/version/.test(x.url()) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
        await create.click();
        let win;
        if (!L35) {
            win = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
            const stage = win.locator('select[name="versionStage"]');
            await stage.waitFor({state: 'visible', timeout: T}); await idle(page); await sleep(1200);
            if (!(await stage.inputValue())) await stage.selectOption('VoR');
            const minor = win.locator('select[name="versionIsMinor"]');
            if (await minor.isVisible().catch(() => false) && !(await minor.inputValue())) await minor.selectOption('true');
            await win.getByRole('button', {name: 'Confirm', exact: true}).click();
        } else {
            win = page.getByRole('dialog').filter({hasText: /version/i}).last();
            await win.waitFor({timeout: T});
            await win.getByRole('button', {name: 'Yes', exact: true}).click();
        }
        const resp = await vr;
        await win.waitFor({state: 'detached', timeout: T}).catch(() => {});
        await idle(page); await sleep(800);
        const after = logRows();
        const added = after.filter((x) => !before.includes(x));
        fact('createNewVersion', {status: resp ? resp.status() : null, serverLog: log.since(from)});
        fact('after', {eventLogAdded: added, proofFiles: proofFiles(), representations: representations(), activityLog: await readActivityLog('after')});

        const fileRows = added.filter((x) => /submission\.event\.(fileUploaded|fileRevised|revisionUploaded)/.test(x));
        const copies = proofFiles().length - out.before.proofFiles.length;
        const verdict = !resp || resp.status() !== 200 ? 'no-version'
            : fileRows.length ? 'logs-upload' : (isOMP || copies > 0 ? 'fixed' : 'no-copy');
        fact('verdict', {verdict, fileRows, copiesMade: copies, activityLogNew: (out.after.activityLog || []).filter((x) => !(out.before.activityLog || []).includes(x))});
    } finally { await close(); }
});
