// PR review of pkp/pkp-lib#13460 round 9 (pkp/ojs#5903, pkp/omp#2495, pkp/ops#1435; issue
// pkp/pkp-lib#13447), at lib/pkp `58c7f454ff` ("Address review comments": Repo::doi()->assignOnCreation()
// renamed assignOnItemCreation() in every caller, an error_log() in two catch blocks, one more guard in
// the review assignment's assignDoiOnCreation()). The callers of the renamed method the other kept
// checks do not reach, each driven once: with "Immediately, when an item is created", an object added
// to an already-submitted work, a new issue, and a review that becomes confirmed and public get their
// DOI in the request that creates them, and none of those requests answers a server error.
//
// All three apps. Per app a scratch context of its own (DOIs on for every kind the app offers, prefix
// 10.1234, default suffix; a journal: reviews not public by default, one reviewer).
// Steps, on screen as the context's manager unless said otherwise:
//   1. Settings > Distribution > DOIs > Setup: "Automatic DOI Assignment" "Immediately, when an item is
//      created (only with the default DOI suffix)", Save; the "Items with DOIs" boxes read back.
//   2. (scenario API) a submitted work W (its `submission_progress` empty; it gets its DOI at submission).
//   3. OJS: Issues > "Create Issue" (Volume 9, Number 9, Year 2026, the "Title" show box unticked),
//      "Save" -> the issue's DOI.
//   4. OJS, OPS: W's workflow > Publication ("Preprint") > "Galleys" > "Add galley", label "PDF", "Save"
//      -> the galley's DOI (read at once); then the upload wizard the save opens is walked to "Complete".
//   5. OMP: W's "Chapters" > "Add Chapter" with "Show this chapter on its own page…" ticked, "Save"
//      -> the chapter's DOI; a second chapter with the box left unticked is the control (a chapter
//      without a page gets no DOI: createDois() takes chapters with a page only).
//   6. OMP: W's "Publication Formats" > "Add publication format", name "PDF", "OK" -> the format's DOI;
//      then the format's "Change File" (the proof-file upload wizard to "Complete") -> the file's DOI.
//   7. OJS: two works at Review (scenario API: "Send for Review", one completed review each, not public):
//      R: "Read Review" > "Mark as Complete" (confirmed, not public: no DOI expected; the window sends
//         `consider` twice, "viewed" as it opens and "considered" on the button), then the row's "Edit" >
//         "Public Visibility" ticked > "OK" (DOI expected);
//      Q: the other order: "Public Visibility" ticked first (no DOI expected), then "Mark as Complete"
//         (DOI expected).
//   8. The DOIs page: W's row expanded (and a journal's "Issues" tab), the DOI boxes read.
// DOIs are read from the database after each step; each step keeps the status of every request it sent
// that is not a GET. PASS when every created object has a DOI right after its creation request, the
// reviews have none before they are confirmed and public and one after, and no request of the run
// answered 5xx; otherwise FAIL naming what had no DOI or which request failed.
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=pr13460r9c node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13460/item-creation.js
// Facts: .reports/sync/pr13460r9c/item-creation-<app>.json with screenshots
const path = require('path');
const {expect} = require('@playwright/test');
const {forEachApp, launch, signIn, record, shot, idle, tag, sql, serverLog} = require('../../../probe');
const {DoisPage, DoiSettings, recordNotices} = require('../../../pages/DoisPages.js');
const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
const L = require('./lib');

const KINDS = {...L.KINDS, ojs: ['publication', 'representation', 'issue', 'peerReview']};
const GALLEY = {ojs: {component: 'Article Text', file: 'article.pdf', group: 'Publication'}, ops: {component: 'Preprint Text', file: 'preprint.pdf', group: 'Preprint'}};
const fixture = (app, name) => path.resolve(process.cwd(), 'apps', app.name, 'playwright', 'fixtures', 'files', name);
const rows = (app, q) => String(sql(app, q)).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split('|'));

/** Every answer of the page since `mark()`: the ones that are not a GET (`sent`) and the 5xx ones (`failed`). */
function watch(page, app) {
    const seen = [];
    page.on('response', (r) => {
        const q = r.request();
        const method = q.headers()['x-http-method-override'] || q.method();
        seen.push({method, url: r.url().replace(app.baseURL, '').replace(/\?.*$/, '').replace(/^\/index\.php\/[^/]+/, ''), status: r.status()});
    });
    const show = (x) => `${x.method} ${x.url} ${x.status}`;
    return {
        mark: () => seen.length,
        sent: (from, pattern) => seen.slice(from).filter((x) => x.method !== 'GET' && (!pattern || pattern.test(x.url))).map(show),
        failed: (from = 0) => seen.slice(from).filter((x) => x.status >= 500).map(show),
    };
}

/** A step: what it sent (the requests matching `pattern`), what answered 5xx, and the error if it threw. */
async function step(out, w, name, pattern, fn) {
    const from = w.mark();
    const s = {};
    try {
        await fn(s);
    } catch (e) {
        s.error = String(e && e.message || e).split('\n')[0].slice(0, 300);
    }
    s.requests = w.sent(from, pattern);
    s.failed = w.failed(from);
    out.steps[name] = s;
    return s;
}

/** The review of the work: its DOI, whether an editor confirmed it and whether it is public. */
function review(app, id) {
    const [r] = rows(app, `select ra.review_id, coalesce(d.doi,'-'), (ra.date_considered is not null or ra.date_acknowledged is not null), ra.is_review_publicly_visible
        from review_assignments ra left join dois d on d.doi_id=ra.doi_id where ra.submission_id=${id} order by 1`);
    return {id: Number(r[0]), doi: r[1], confirmed: r[2] === 't', public: r[3] === 't' || r[3] === '1'};
}

/** On the DOIs page: the expanded row's lines, [{type, doi, badge}]. */
async function pageRow(dp, id, type = 'submission') {
    const row = dp.row(id, type);
    await dp.expand(row, id);
    return dp.doiRows(row).evaluateAll((trs) => trs.map((tr) => ({
        type: (tr.querySelector('td label')?.textContent || '').replace(/\s+/g, ' ').trim(),
        doi: tr.querySelector('input[type="text"]')?.value ?? null,
        badge: (tr.querySelector('.doiListItem__itemMetadata--badge')?.textContent || '').replace(/\s+/g, ' ').trim(),
    })));
}

forEachApp(async (app) => {
    const name = app.name;
    const t = tag('p13460i');
    const extra = {enabledDoiTypes: KINDS[name]};
    if (name === 'ojs') {
        Object.assign(extra, {review: {defaultReviewPublicVisibility: false},
            users: [{username: `${t}mgr`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}, {username: `${t}rv`, roles: ['externalReviewer']}]});
    }
    const {mgr, au} = await L.scratchContext(app, t, extra);
    const out = {tag: t, steps: {}};
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    const w = watch(page, app);
    const need = [];   // [what, doi] of every object that must have a DOI at its creation
    const none = [];   // [what, doi] of every read that must show no DOI
    try {
        await recordNotices(page);
        await signIn(page, mgr, {contextPath: t});

        // 1. "Immediately" chosen on screen; the kinds ticked, read back from the form.
        out.setting = await L.chooseImmediately(page, t);
        if (!out.setting.saved) {
            console.log(`[item-creation] ${name}: NOT APPLICABLE — no "Immediately" option (${out.setting.options.join(' / ')})`);
            return;
        }
        out.kinds = (await new DoiSettings(page, t).kinds()).map((k) => `${k.checked ? '[x]' : '[ ]'} ${k.label}`);

        // 2. A submitted work, by the scenario API.
        const r = await app.api.createSubmission({tag: `${t}w`, context: t, submitter: au, title: `Submitted work ${t}`});
        const W = L.sid(r);
        const [[pubId, progress, workDoi]] = rows(app, `select s.current_publication_id, coalesce(s.submission_progress,''), coalesce(d.doi,'-') from submissions s
            join publications p on p.publication_id=s.current_publication_id left join dois d on d.doi_id=p.doi_id where s.submission_id=${W}`);
        out.work = {id: W, publicationId: Number(pubId), submissionProgress: progress, doi: workDoi};
        need.push(['work at submission (API)', workDoi]);

        // 3. A journal: "Create Issue".
        if (name === 'ojs') {
            const {IssuesAdmin} = require('../../../pages/IssuesPages.js');
            const s = await step(out, w, 'issue', /update-issue/, async (s) => {
                const issues = new IssuesAdmin(page, t);
                await issues.goto('Future Issues');
                const {dialog, form} = await issues.openCreate();
                await form.volumeBox().fill('9');
                await form.numberBox().fill('9');
                await form.yearBox().fill('2026');
                await form.showBox('Title').uncheck();   // a shown title is a required one
                await form.save();
                // A refused legacy save answers 200 with the form again: keep what it says.
                s.refused = (await dialog.locator('.error:visible, .pkp_form_error:visible, label.error:visible').allInnerTexts().catch(() => [])).join(' / ') || undefined;
                const [i] = rows(app, `select i.issue_id, coalesce(d.doi,'-') from issues i left join dois d on d.doi_id=i.doi_id
                    where i.journal_id=(select journal_id from journals where path='${t}') order by 1 desc limit 1`);
                Object.assign(s, {id: Number((i || [])[0]), doi: (i || [])[1] || 'no issue row'});
                await expect(dialog).toHaveCount(0, {timeout: 30000});
            });
            need.push(['issue', s.doi]);
        }

        // 4. A journal, a preprint server: "Add galley".
        if (GALLEY[name]) {
            const g = GALLEY[name];
            const {GalleyManager} = require('../../../pages/GalleysPages.js');
            const galleyDoi = () => (rows(app, `select g.galley_id, coalesce(d.doi,'-') from publication_galleys g left join dois d on d.doi_id=g.doi_id
                where g.publication_id=${pubId} order by 1`)[0] || [null, 'no galley row']);
            const s = await step(out, w, 'galley', /update-galley|upload-file|save-file|finish-file/, async (s) => {
                const frame = new WorkflowPage(page, t, {labels: {publicationGroup: g.group}});
                const galleys = new GalleyManager(page, frame);
                await galleys.open(W, Number(pubId));
                const win = await galleys.openCreate();
                await win.type(win.labelBox(), 'PDF');
                s.save = (await win.save()).status();
                [s.id, s.doi] = galleyDoi();
                await galleys.uploadInWizard({component: g.component, file: fixture(app, g.file), name: g.file});
                s.doiAfterUpload = galleyDoi()[1];
                await shot(page, 'item-creation-galley');
            });
            need.push(['galley', s.doi || galleyDoi()[1]]);
        }

        // 5, 6. A press: "Add Chapter" (with a page; the control without), "Add publication format", its proof file.
        if (name === 'omp') {
            const {ChaptersPage} = require('../../../../../apps/omp/playwright/pages/ChapterPages.js');
            const {PublicationFormatsPage} = require('../../../../../apps/omp/playwright/pages/PublicationFormatPages.js');
            const chapterDoi = (title) => (rows(app, `select c.chapter_id, coalesce(d.doi,'-') from submission_chapters c
                join submission_chapter_settings cs on cs.chapter_id=c.chapter_id and cs.setting_name='title' and cs.setting_value='${title}'
                left join dois d on d.doi_id=c.doi_id where c.publication_id=${pubId}`)[0] || [null, 'no chapter row']);
            const chapters = new ChaptersPage(page, t);
            const addChapter = (key, title, withPage) => step(out, w, key, /update-chapter/, async (s) => {
                await chapters.gotoEditorial(W, Number(pubId));
                const win = await chapters.list.openAdd();
                await win.fill({title});
                if (withPage) await win.chapterPageBox().check();
                s.pageBox = await win.chapterPageBox().isChecked();
                await win.save().finally(() => { [s.id, s.doi] = chapterDoi(title); });
            });
            need.push(['chapter with a page', (await addChapter('chapter', `Chapter with a page ${t}`, true)).doi]);
            out.steps.chapterNoPage = await addChapter('chapterNoPage', `Chapter without a page ${t}`, false);

            const formatDoi = () => (rows(app, `select f.publication_format_id, coalesce(d.doi,'-') from publication_formats f left join dois d on d.doi_id=f.doi_id
                where f.publication_id=${pubId} order by 1`)[0] || [null, 'no format row']);
            const fileDoi = () => (rows(app, `select sf.submission_file_id, coalesce(d.doi,'-') from submission_files sf
                join publication_formats f on f.publication_format_id=sf.assoc_id and sf.assoc_type=521 left join dois d on d.doi_id=sf.doi_id
                where sf.file_stage=10 and f.publication_id=${pubId} order by 1`)[0] || [null, 'no file row']);
            const formats = new PublicationFormatsPage(page, t);
            const f = await step(out, w, 'format', /update-format/, async (s) => {
                await formats.gotoEditorial(W, Number(pubId));
                const win = await formats.openAdd();
                await win.typeName('PDF');
                await win.ok().finally(() => { [s.id, s.doi] = formatDoi(); });
            });
            need.push(['publication format', f.doi]);
            const p = await step(out, w, 'proofFile', /upload-file|save-file|finish-file|edit-metadata|file-upload/, async (s) => {
                await formats.uploadWithChangeFile('PDF', fixture(app, 'article.pdf')).finally(() => { [s.id, s.doi] = fileDoi(); });
                await shot(page, 'item-creation-formats');
            });
            need.push(['proof file', p.doi]);
        }

        // 7. A journal: a completed review, confirmed then made public (R), and made public then confirmed (Q).
        if (name === 'ojs') {
            const R = require('../../../../../apps/ojs/playwright/pages/ReviewStagePages.js');
            const reviewRounds = [{reviewers: [{username: `${t}rv`, status: 'completed', comments: 'A review.'}]}];
            const atReview = async (k) => L.sid(await app.api.createSubmission({tag: `${t}${k}`, context: t, submitter: au, title: `Reviewed article ${t}${k}`,
                decisions: ['sendExternalReview'], reviewRounds}));
            const wf = new WorkflowPage(page, t);
            const row = () => page.getByRole('row').filter({has: page.getByRole('button', {name: 'More Actions'})}).first();
            const openRound = async (id) => {
                await wf.gotoEditorial(id);
                await idle(page);
                await wf.selectRound(1);
                await idle(page);
                await expect(row()).toBeVisible({timeout: 30000});
            };
            const confirm = (key, id) => step(out, w, key, /reviewAssignments\/\d+\/consider/, async (s) => {
                await openRound(id);
                const modal = await R.openReviewDetails(page, row());
                await R.markReviewComplete(page, modal);
                s.after = review(app, id);
                await R.closeReviewDetails(page, modal);
                await idle(page);
            });
            const makePublic = (key, id) => step(out, w, key, /update-review/, async (s) => {
                await openRound(id);
                const modal = await R.openEditReview(page, row());
                await R.publicVisibilityCheckbox(modal).check();
                await R.saveEditReview(page, modal);
                await idle(page);
                s.after = review(app, id);
            });
            const idR = await atReview('r'), idQ = await atReview('q');
            out.reviews = {R: {id: idR, seeded: review(app, idR)}, Q: {id: idQ, seeded: review(app, idQ)}};
            const r1 = await confirm('reviewR_confirm', idR);
            const r2 = await makePublic('reviewR_public', idR);
            const q1 = await makePublic('reviewQ_public', idQ);
            const q2 = await confirm('reviewQ_confirm', idQ);
            await shot(page, 'item-creation-review');
            const doi = (s) => (s.after || review(app, s === r1 || s === r2 ? idR : idQ)).doi;
            none.push(['review R as seeded', out.reviews.R.seeded.doi], ['review R confirmed, not public', doi(r1)],
                ['review Q as seeded', out.reviews.Q.seeded.doi], ['review Q public, not confirmed', doi(q1)]);
            need.push(['review R confirmed then public', doi(r2)], ['review Q public then confirmed', doi(q2)]);
            out.reviews.R.end = review(app, idR);
            out.reviews.Q.end = review(app, idQ);
        }

        // 8. The DOIs page: the work's row, a journal's issue row.
        await step(out, w, 'doisPage', null, async (s) => {
            const dp = new DoisPage(page, t);
            await dp.goto();
            s.work = await pageRow(dp, W);
            if (out.reviews) s.reviewR = await pageRow(dp, out.reviews.R.id);
            await shot(page, 'item-creation-dois-page');
            if (name === 'ojs' && out.steps.issue.id) {
                await dp.openTab('Issues');
                s.issue = await pageRow(dp, out.steps.issue.id, 'issue');
            }
        });
    } finally {
        out.failed = w.failed();
        out.serverLog = log.since(from);
        out.need = need;
        out.none = none;
        record('item-creation', out);
        await close();
    }

    const has = (doi) => /^10\.1234\//.test(doi || '');
    const missing = need.filter(([, doi]) => !has(doi)).map(([what, doi]) => `${what}: ${doi || 'not read'}`);
    const early = none.filter(([, doi]) => doi !== '-').map(([what, doi]) => `${what}: ${doi}`);
    const errors = Object.entries(out.steps).filter(([, s]) => s.error).map(([k, s]) => `${k}: ${s.error}`);
    const ok = !missing.length && !early.length && !out.failed.length && !errors.length;
    const st = (k) => {
        const s = out.steps[k];
        return s ? `${s.doi || (s.after && s.after.doi) || '?'} [${s.requests.join('; ') || 'no request seen'}]` : 'not driven';
    };
    const parts = [`"${out.setting.saved}", items ${out.kinds.join(' ')}`, `work ${out.work.id} (submissionProgress "${out.work.submissionProgress}") DOI at submission ${out.work.doi}`];
    if (name === 'ojs') parts.push(`"Create Issue" -> issue ${out.steps.issue.id} DOI ${st('issue')}`);
    if (GALLEY[name]) parts.push(`"Add galley" -> galley ${out.steps.galley.id} DOI ${st('galley')}, after the file upload ${out.steps.galley.doiAfterUpload}`);
    if (name === 'omp') {
        parts.push(`"Add Chapter" with a page -> chapter ${out.steps.chapter.id} DOI ${st('chapter')}`,
            `control, "Add Chapter" without a page -> chapter ${out.steps.chapterNoPage.id} DOI ${st('chapterNoPage')}`,
            `"Add publication format" -> format ${out.steps.format.id} DOI ${st('format')}`,
            `"Change File" (proof file) -> file ${out.steps.proofFile.id} DOI ${st('proofFile')}`);
    }
    if (out.reviews) {
        const rv = out.reviews;
        parts.push(`review R ${rv.R.seeded.id}: seeded ${rv.R.seeded.doi} (confirmed ${rv.R.seeded.confirmed}, public ${rv.R.seeded.public}), "Mark as Complete" -> ${st('reviewR_confirm')}, "Public Visibility" ticked -> ${st('reviewR_public')}`,
            `review Q ${rv.Q.seeded.id}: seeded ${rv.Q.seeded.doi}, "Public Visibility" ticked -> ${st('reviewQ_public')}, "Mark as Complete" -> ${st('reviewQ_confirm')}`);
    }
    const dpage = out.steps.doisPage || {};
    parts.push(`DOIs page row of the work ${JSON.stringify((dpage.work || []).map((x) => `${x.type}: ${x.doi} ${x.badge}`))}`
        + (dpage.issue ? `, of the issue ${JSON.stringify(dpage.issue.map((x) => `${x.type}: ${x.doi} ${x.badge}`))}` : '')
        + (dpage.reviewR ? `, of R's work ${JSON.stringify(dpage.reviewR.map((x) => `${x.type}: ${x.doi} ${x.badge}`))}` : ''));
    const why = [missing.length ? `no DOI at creation: ${missing.join(', ')}` : '', early.length ? `a DOI before confirmed and public: ${early.join(', ')}` : '',
        out.failed.length ? `5xx: ${out.failed.join(', ')}` : '', errors.length ? `step errors: ${errors.join(' | ')}` : ''].filter(Boolean).join('; ');
    console.log(`[item-creation] ${name}: ${ok ? 'PASS (every created object got its DOI at creation, no 5xx)' : `FAIL (${why})`} — ${parts.join('; ')}; `
        + `5xx answers ${out.failed.length}, server log lines ${out.serverLog.length}`);
});
