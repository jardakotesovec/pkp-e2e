// PR review of pkp/pkp-lib#13460 round 6 (pkp/ojs#5903; issues pkp/pkp-lib#13447 and #13450), report
// docs/reports/2026-10-07-pkp-lib-13460.md, spec U45 OJS6: on a published article, a review whose DOI is
// "Registered" and whose "Public Visibility" an editor then unticks keeps its DOI (as designed); the per-work
// "Deposit DOIs" marks that DOI "Submitted", while the deposit job's list (getExportableDOIsPeerReviewIds(),
// public reviews only) leaves it out and the DOIs page shows no row for it. Since round 6
// getCompletedReviewAssignments() takes every confirmed review, a published work's included, with no
// visibility condition; up to round 5 it left out every review of a published work, so the DOI kept its status.
//
// OJS only (peer-review DOIs). Seeds its own scratch journal (DOIs on for articles and peer reviews, prefix
// 10.1234, default suffix, "Upon publication", reviews public by default, Crossref enabled with a depositor but
// no credentials) and two works at Review, each with one completed public review:
//   H (the finding): the editor confirms the review on screen ("Read Review" > "Mark as Complete"); the work is
//     published as the Version of Record 1.0 through the publication API the publish panel calls (the publish
//     gives the article and the review their DOIs); DOIs page "Mark DOIs Registered" on H; "Edit" on the review >
//     untick "Public Visibility" > OK; H's DOIs page row and the public review record; "Deposit DOIs" on H;
//     statuses and the job's list; then "Public Visibility" ticked again and H's DOIs page row read once more;
//   G (control): the same, without unticking: "Deposit DOIs" marks the review "Submitted" and the job lists it.
// The reviews the deposit sends are read the way the job reads them (review-deposit-all.php, read-only CLI).
// Statuses are read from the database. The queued jobs are not run (no Crossref credentials, offline), so
// Crossref's answer, which would mark H's review "Registered" again through updateDepositStatus(), is read only.
// At round 5 (`6331e43478`) and the tips H's review is not in the "Deposit DOIs" set, so the line reads PASS.
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=pr13460r6b node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13460/review-nonpublic-deposit.js
// Facts: .reports/sync/pr13460r6b/review-nonpublic-deposit-ojs.json with screenshots
const path = require('path');
const {execFileSync} = require('child_process');
const {request: pwRequest, expect} = require('@playwright/test');
const {forEachApp, launch, signIn, record, shot, idle, tag, sql, serverLog} = require('../../../probe');
const {DoisPage, recordNotices} = require('../../../pages/DoisPages.js');
const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
const L = require('./lib');

const STATUS = {0: 'none', 1: 'Unregistered', 2: 'Submitted', 3: 'Registered', 4: 'Error', 5: 'Needs Sync'};

/** The work's status and article DOI, and its first review's DOI, confirmation and visibility. */
function dois(app, id) {
    const s = String(sql(app, `select s.status, coalesce(d.doi,'-'), coalesce(d.status,0) from submissions s join publications p on p.publication_id=s.current_publication_id
        left join dois d on d.doi_id=p.doi_id where s.submission_id=${id}`)).trim().split('|');
    const r = String(sql(app, `select ra.review_id, coalesce(ra.doi_id,0), coalesce(d.doi,'-'), coalesce(d.status,0),
        (ra.date_considered is not null or ra.date_acknowledged is not null), ra.is_review_publicly_visible
        from review_assignments ra left join dois d on d.doi_id=ra.doi_id where ra.submission_id=${id} order by 1`)).trim().split('\n')[0].split('|');
    return {submissionStatus: Number(s[0]), article: {doi: s[1], status: STATUS[s[2]] || s[2]},
        review: {id: Number(r[0]), doiId: Number(r[1]), doi: r[2], status: STATUS[r[3]] || r[3], confirmed: r[4] === 't', public: r[5] === 't' || r[5] === '1'}};
}

/** The lists the deposit reads (review-deposit-all.php, read-only). */
function lists(app, t, ids) {
    const root = path.resolve(process.cwd(), app.root);
    const config = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(process.cwd(), app.configFile);
    const out = execFileSync('php', [path.join(__dirname, 'review-deposit-all.php'), root, t, ...ids.map(String)],
        {env: {...process.env, PKP_CONFIG_FILE: config}, encoding: 'utf8', timeout: 120000});
    return JSON.parse(out.trim().split('\n').pop());
}
const sends = (l) => [...new Set([...(l.exportable.single || []), ...(l.exportable.versioning || [])])];

forEachApp(async (app) => {
    if (app.name !== 'ojs') {
        console.log(`[review-nonpublic-deposit] ${app.name}: skipped (OJS only)`);
        return;
    }
    const t = tag('p13460n');
    const {mgr, au} = await L.scratchContext(app, t, {
        enabledDoiTypes: ['publication', 'peerReview'], doiCreationTime: 'publication',
        review: {defaultReviewPublicVisibility: true},
        registrationAgency: 'crossrefplugin', publisherInstitution: 'Public Knowledge Project', onlineIssn: '1234-5679',
        plugins: {crossrefplugin: {enabled: true, settings: {depositorName: 'Public Knowledge Project', depositorEmail: 'doi@mail.test'}}},
        users: [{username: `${t}mgr`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}, {username: `${t}rv`, roles: ['externalReviewer']}],
    });
    const reviewRounds = [{reviewers: [{username: `${t}rv`, status: 'completed', comments: 'A public review.'}]}];
    const atReview = async (k) => app.api.createSubmission({tag: `${t}${k}`, context: t, submitter: au, title: `Reviewed article ${t}${k}`,
        decisions: ['sendExternalReview'], reviewRounds});
    const rg = await atReview('g'), rh = await atReview('h');
    const G = L.sid(rg), H = L.sid(rh);
    const out = {tag: t, ids: {G, H}};
    const log = serverLog(app);
    const from = log.mark();
    const pub = await pwRequest.newContext();
    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    try {
        await recordNotices(page);
        await signIn(page, mgr, {contextPath: t});
        const R = require('../../../../../apps/ojs/playwright/pages/ReviewStagePages.js');
        const wf = new WorkflowPage(page, t);
        const dp = new DoisPage(page, t);
        const row = () => page.getByRole('row').filter({has: page.getByRole('button', {name: 'More Actions'})}).first();
        const openRound = async (id) => {
            await wf.gotoEditorial(id);
            await idle(page);
            await wf.selectRound(1);
            await idle(page);
            await expect(row()).toBeVisible({timeout: 30000});
        };
        const confirm = async (id) => {
            await openRound(id);
            const modal = await R.openReviewDetails(page, row());
            await R.markReviewComplete(page, modal);
            await R.closeReviewDetails(page, modal);
            await idle(page);
        };
        const setPublic = async (id, on) => {
            await openRound(id);
            const modal = await R.openEditReview(page, row());
            const box = R.publicVisibilityCheckbox(modal);
            if (on) await box.check(); else await box.uncheck();
            await R.saveEditReview(page, modal);
            await idle(page);
        };
        const pageRow = async (id) => {
            await dp.goto();
            const r = dp.row(id);
            await dp.expand(r, id);
            const badges = [];
            for (const type of await dp.doiTypes(r)) badges.push(`${type}: ${(await dp.doiBadge(r, type).innerText()).trim()}`);
            return badges;
        };
        const bulk = async (label, id) => { await dp.goto(); return (await dp.runBulk(label, [id])).status(); };
        const publicRecord = async (id) => {
            const r = await pub.get(app.url(`/index.php/${t}/api/v1/peerReviews/open/submissions/${id}`));
            if (r.status() !== 200) return {status: r.status()};
            const j = await r.json();
            return (j.reviewRounds || j.rounds || []).flatMap((x) => (x.reviews || []).map((y) => ({id: y.id, doi: y.doi})));
        };

        // Both reviews confirmed on screen, then both works published as the Version of Record.
        await confirm(G);
        await confirm(H);
        await dp.goto();
        const meta = await page.evaluate(() => ({api: pkp.context.apiBaseUrl, csrf: pkp.currentUser.csrfToken}));
        const h = {headers: {'X-Csrf-Token': meta.csrf, 'Content-Type': 'application/json'}};
        out.publish = {};
        for (const [k, r] of [['G', rg], ['H', rh]]) {
            const id = L.sid(r);
            const pubId = r.publicationId || Number(String(sql(app, `select current_publication_id from submissions where submission_id=${id}`)).trim());
            const x1 = await page.request.put(`${meta.api}submissions/${id}/publications/${pubId}`, {...h, data: {versionStage: 'VoR', versionMajor: 1, versionMinor: 0}});
            const x2 = await page.request.put(`${meta.api}submissions/${id}/publications/${pubId}/publish`, h);
            out.publish[k] = [x1.status(), x2.status()];
        }
        out.published = {G: dois(app, G), H: dois(app, H)};

        // Control: "Deposit DOIs" on G.
        out.depositG = await bulk('Deposit DOIs', G);
        out.afterDepositG = {G: dois(app, G), lists: lists(app, t, [G])};

        // H: "Mark DOIs Registered", the review taken out of public view, "Deposit DOIs".
        out.markH = await bulk('Mark DOIs Registered', H);
        out.registered = dois(app, H);
        await setPublic(H, false);
        out.hidden = {H: dois(app, H), pageRow: await pageRow(H), record: await publicRecord(H), lists: lists(app, t, [H])};
        out.depositH = await bulk('Deposit DOIs', H);
        out.afterDepositH = {H: dois(app, H), lists: lists(app, t, [H])};
        await shot(page, 'review-nonpublic-deposit-after-deposit');

        // H: "Public Visibility" ticked again: the row comes back with the status the deposit left.
        await setPublic(H, true);
        out.shownAgain = {H: dois(app, H), pageRow: await pageRow(H), record: await publicRecord(H)};
        await shot(page, 'review-nonpublic-deposit-shown-again');
    } finally {
        out.serverLog = log.since(from);
        record('review-nonpublic-deposit', out);
        await pub.dispose();
        await close();
    }

    const hr = out.afterDepositH.H.review;
    const hidden = out.hidden.H.review;
    const set = (out.hidden.lists.published[H] || []);
    const bug = hidden.doi !== '-' && !hidden.public && hidden.status === 'Registered' && hr.status === 'Submitted'
        && !sends(out.afterDepositH.lists).includes(hr.id);
    console.log(`[review-nonpublic-deposit] ojs: ${bug ? 'FAIL (bug shows)' : 'PASS (bug does not show)'} — `
        + `H (status ${out.published.H.submissionStatus}, VoR published ${JSON.stringify(out.publish.H)}), review ${hidden.id} DOI ${out.published.H.review.doi} at publication; `
        + `"Mark DOIs Registered" ${out.markH} -> article ${out.registered.article.status}, review ${out.registered.review.status}; `
        + `"Public Visibility" unticked -> review ${hidden.status} (public ${hidden.public}, confirmed ${hidden.confirmed}), DOIs page row ${JSON.stringify(out.hidden.pageRow)}, `
        + `public record ${JSON.stringify(out.hidden.record)}, "Deposit DOIs" set ${JSON.stringify(set)} (review DOI id ${hidden.doiId}); `
        + `"Deposit DOIs" ${out.depositH} -> article ${out.afterDepositH.H.article.status}, review ${hr.status}; reviews the job sends: ${JSON.stringify(sends(out.afterDepositH.lists))}; `
        + `ticked again -> DOIs page row ${JSON.stringify(out.shownAgain.pageRow)}, DOI ${out.shownAgain.H.review.doi}`);
    const gr = out.afterDepositG.G.review;
    console.log(`[review-nonpublic-deposit] ojs control: G (status ${out.published.G.submissionStatus}, VoR ${JSON.stringify(out.publish.G)}), public confirmed review ${gr.id} `
        + `DOI ${out.published.G.review.doi} at publication; "Deposit DOIs" ${out.depositG} -> article ${out.afterDepositG.G.article.status}, review ${gr.status}; `
        + `reviews the job sends: ${JSON.stringify(sends(out.afterDepositG.lists))}`);
});
