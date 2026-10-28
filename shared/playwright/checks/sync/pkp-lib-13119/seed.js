// Kept check for pkp/pkp-lib#13119 / pkp/ojs#5715 / pkp/crossref-ojs#112 (issue pkp/pkp-lib#13062, regression read
// rr13062, 2026-10-28): seeds the scratch journals the other scripts of this folder read. OJS only. Runs at the PR
// heads and at the bases alike (the journals choose Crossref, which takes "Peer Review" at both refs; the DataCite
// plugin is enabled beside it, and xml.php / deposit.js call either agency's own export directly).
//
//   X  en primary (en, fr_CA), DOIs for articles and peer reviews, "Upon reaching the copyediting stage", reviews
//      public by default, Crossref chosen, DataCite enabled; DOI Versioning "No".
//      W1 en title, four completed reviews in round 1: r1 anonymous and r2 double-anonymous completed at the same
//         second, r3 open (verified ORCID, affiliation en), r4 open (unverified ORCID, affiliation fr_CA only);
//      W2 a fr_CA submission titled in fr_CA only, one review (r1, anonymous);
//      W3 en title with a URL path ("rr13-<tag>"), one review (r3, open).
//   V  as X with DOI Versioning "Yes": W4 one open review on version 1; version 2 created and published on screen.
//   F  fr_CA primary (fr_CA, en): W5 a fr_CA work, one review (r6, double-anonymous).
// Every review is confirmed with the call the "Mark as Complete" button makes (PUT …/reviewAssignments/{id}/consider,
// considered 3), the review methods are set in the scratch rows, and "Assign DOIs" is pressed on the DOIs page for
// every work (so the reviews get their DOIs, U45 Rule 7a).
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=rr13062 node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13119/seed.js
// Facts: .reports/sync/<agent>/seed-ojs.json (contexts, works, review ids, publication ids); read by the other scripts.
const {forEachApp, launch, signIn, record, shot, idle, tag, sql, serverLog} = require('../../../probe');
const {DoisPage, recordNotices} = require('../../../pages/DoisPages.js');
const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
const L = require('../pkp-lib-13460/lib');

const q = (app, s) => String(sql(app, s)).trim();

forEachApp(async (app) => {
    if (app.name !== 'ojs') return console.log(`[seed] ${app.name}: skipped (OJS only)`);
    const base = tag('rr13');
    const crossref = {enabled: true, settings: {depositorName: 'Public Knowledge Project', depositorEmail: 'doi@mail.test'}};
    const ctx = (t, extra) => app.api.createContext({
        tag: t, enableDois: true, doiPrefix: '10.1234', enabledDoiTypes: ['publication', 'peerReview'],
        doiCreationTime: 'copyediting', doiSuffixType: 'default', review: {defaultReviewPublicVisibility: true},
        registrationAgency: 'crossrefplugin', publisherInstitution: 'Public Knowledge Project', onlineIssn: '1234-5679',
        plugins: {crossrefplugin: crossref, dataciteplugin: {enabled: true, settings: {username: 'RR13SYM'}}},
        ...extra,
    });
    const rv = (u, given, family, more = {}) => ({username: u, roles: ['externalReviewer'], givenName: given, familyName: family, ...more});
    const X = `${base}x`, V = `${base}v`, F = `${base}f`;
    await ctx(X, {context: {supportedLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA']}, users: [
        {username: `${X}mgr`, roles: ['manager']}, {username: `${X}au`, roles: ['author']},
        rv(`${X}r1`, 'Anouk', 'Hiddenwell', {affiliation: {en: 'Secretive University'}, orcid: 'https://orcid.org/0000-0002-1825-0097', orcidIsVerified: true}),
        rv(`${X}r2`, 'Bertil', 'Doubleblind', {affiliation: {en: 'Unseen Institute'}, orcid: 'https://orcid.org/0000-0001-5109-3700', orcidIsVerified: true}),
        rv(`${X}r3`, 'Clara', 'Openshaw', {affiliation: {en: 'Open Review College'}, orcid: 'https://orcid.org/0000-0002-1694-233X', orcidIsVerified: true}),
        rv(`${X}r4`, 'Dmitri', 'Unverifiedson', {affiliation: {fr_CA: 'Université Francophone'}, orcid: 'https://orcid.org/0000-0003-1415-9269', orcidIsVerified: false}),
    ]});
    await ctx(V, {doiVersioning: true, users: [{username: `${V}mgr`, roles: ['manager']}, {username: `${V}au`, roles: ['author']},
        rv(`${V}r5`, 'Elin', 'Versionreader', {affiliation: {en: 'Version College'}})]});
    await ctx(F, {context: {primaryLocale: 'fr_CA', supportedLocales: ['fr_CA', 'en'], supportedSubmissionLocales: ['fr_CA'],
        name: {fr_CA: `Revue ${F}`}}, users: [{username: `${F}mgr`, roles: ['manager']}, {username: `${F}au`, roles: ['author']},
            rv(`${F}r6`, 'Fanny', 'Doublaveugle', {affiliation: {fr_CA: 'Institut Caché'}})]});

    const done = (u, date) => ({username: u, status: 'completed', comments: `A public review by ${u}.`, ...(date ? {dateCompleted: date} : {})});
    const sub = async (c, k, title, reviewers, extra = {}) => L.sid(await app.api.createSubmission({tag: `${c}${k}`, context: c,
        submitter: `${c}au`, title, decisions: ['sendExternalReview', 'accept', 'sendToProduction'],
        reviewRounds: [{reviewers}], published: true, ...extra}));
    const W1 = await sub(X, 'w1', `Tidal pool succession ${X}`, [done(`${X}r1`, '2026-10-01'), done(`${X}r2`, '2026-10-01'),
        done(`${X}r3`, '2026-10-02'), done(`${X}r4`, '2026-10-03')]);
    const W2 = await sub(X, 'w2', {fr_CA: `Succession des cuvettes de marée ${X}`}, [done(`${X}r1`)], {locale: 'fr_CA'});
    const W3 = await sub(X, 'w3', `Kelp forest canopy ${X}`, [done(`${X}r3`)]);
    const W4 = await sub(V, 'w4', `Versioned mudflat survey ${V}`, [done(`${V}r5`)]);
    const W5 = await sub(F, 'w5', {fr_CA: `Relevé des vasières ${F}`}, [done(`${F}r6`)], {locale: 'fr_CA'});

    const reviews = (id) => q(app, `select review_id from review_assignments where submission_id=${id} order by review_id`).split('\n').filter(Boolean).map(Number);
    const R = {W1: reviews(W1), W2: reviews(W2), W3: reviews(W3), W4: reviews(W4), W5: reviews(W5)};
    // Review methods (the reviewer row's "Edit" window's choice): 1 anonymous, 2 double-anonymous, 3 open.
    const method = (rid, m) => sql(app, `update review_assignments set review_method=${m} where review_id=${rid}`);
    [1, 2, 3, 3].forEach((m, i) => method(R.W1[i], m));
    method(R.W2[0], 1);
    method(R.W3[0], 3);
    method(R.W4[0], 3);
    method(R.W5[0], 2);
    sql(app, `update publications set url_path='rr13-${X}' where publication_id=(select current_publication_id from submissions where submission_id=${W3})`);

    const out = {contexts: {X, V, F}, works: {W1, W2, W3, W4, W5}, reviews: R};
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    try {
        await recordNotices(page);
        const confirmAndAssign = async (c, works) => {
            await signIn(page, `${c}mgr`, {contextPath: c});
            const dp = new DoisPage(page, c);
            await dp.goto();
            const meta = await page.evaluate(() => ({api: pkp.context.apiBaseUrl, csrf: pkp.currentUser.csrfToken}));
            const h = {headers: {'X-Csrf-Token': meta.csrf, 'Content-Type': 'application/json'}};
            const res = {};
            for (const [k, id] of Object.entries(works)) {
                res[k] = [];
                for (const rid of R[k]) {
                    const r = await page.request.put(`${meta.api}submissions/${id}/reviewAssignments/${rid}/consider`, {...h, data: {considered: 3}});
                    res[k].push(r.status());
                }
            }
            await dp.goto();
            res.assign = (await dp.runBulk('Assign DOIs', Object.values(works))).status();
            return res;
        };
        out.confirmX = await confirmAndAssign(X, {W1, W2, W3});
        out.confirmF = await confirmAndAssign(F, {W5});
        out.confirmV = await confirmAndAssign(V, {W4});
        // V: version 2 created and published on screen (the 13460 helpers), its title changed so the records tell
        // the versions apart.
        const ojsScreen = new (require('../../../../../apps/ojs/playwright/pages/PublishSchedulePages.js').PublishScreen)(page, V);
        const frame = new WorkflowPage(page, V, {labels: {publicationGroup: 'Publication'}});
        await frame.gotoEditorial(W4);
        await frame.expectVersionLoaded().catch(() => {});
        out.v2 = await L.createVersion(page, frame, 'Major Revision');
        sql(app, `update publication_settings set setting_value='Versioned mudflat survey, second version ${V}' where publication_id=${out.v2.id} and setting_name='title'`);
        await frame.gotoEditorial(W4);
        await frame.expectVersionLoaded().catch(() => {});
        out.v2.publish = await L.publishLatest(page, frame, 'Publish', ojsScreen);
        await new DoisPage(page, V).goto();
        out.v2.assign = (await new DoisPage(page, V).runBulk('Assign DOIs', [W4])).status();
        await shot(page, 'seed-v-dois');
    } finally {
        out.serverLog = log.since(from);
        out.rows = q(app, `select ra.submission_id, ra.review_id, ra.review_method, rr.publication_id, coalesce(d.doi,'-'), coalesce(d.status,0),
            ra.date_completed, (ra.date_considered is not null or ra.date_acknowledged is not null), ra.is_review_publicly_visible
            from review_assignments ra join review_rounds rr on rr.review_round_id=ra.review_round_id left join dois d on d.doi_id=ra.doi_id
            where ra.submission_id in (${[W1, W2, W3, W4, W5].join(',')}) order by 2`).split('\n');
        out.publications = Object.fromEntries([['W1', W1], ['W2', W2], ['W3', W3], ['W4', W4], ['W5', W5]].map(([k, id]) => [k, L.versionRows(app, id)]));
        record('seed', out);
        await close();
    }
    console.log(`[seed] ojs: contexts ${JSON.stringify(out.contexts)} works ${JSON.stringify(out.works)} reviews ${JSON.stringify(R)}; `
        + `confirm X ${JSON.stringify(out.confirmX)} F ${JSON.stringify(out.confirmF)} V ${JSON.stringify(out.confirmV)}; v2 ${JSON.stringify(out.v2)}`);
    console.log(`[seed] ojs rows (work|review|method|round's publication|DOI|status|completed|confirmed|public):\n  ${out.rows.join('\n  ')}`);
    console.log(`[seed] ojs versions: ${JSON.stringify(out.publications)}; server log ${JSON.stringify(out.serverLog).slice(0, 600)}`);
});
