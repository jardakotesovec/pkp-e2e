// Regression check, stable-3_5_0 only — pkp/pkp-lib#10744 (pkp-lib merge ce214a4820, OJS e2766a92b3, OPS 21ba689811,
// in every 3.5.0 release): the search index re-sends a published item to ORCID from inside UpdateSubmissionSearchJob
// and MetadataChangedJob; run by the CLI worker (`php lib/pkp/tools/jobs.php work`), whose request has no context,
// OrcidWork::getBibtexCitation() hands it to CitationStyleLanguagePlugin::getCitation(), which fails on
// `$context->getLocalizedName()`. The report is docs/reports/2026-10-21-pkp-lib-10744-stable-3_5_0.md.
// On the line's campaign fleet, in scratch contexts it seeds itself (ORCID on, Member API sandbox): three items, one
// whose contributor has a verified iD with a token, a control whose contributor's iD is unverified, and (OJS) one
// with a declined review; the contributor's role and Country set in the Contributors window (the 3.5 seed leaves
// the contributor without a user group); each published on screen ("Schedule For Publication" › the issue ›
// "Publish"; OPS "Post"); then the queue drained with the CLI worker; Failed Jobs (API and screen, as the admin),
// failed_jobs, the search index rows, the front-end search, and the citation URL the ORCID deposit jobs carry.
// It asserts nothing, so it runs unchanged at the tip and with fix-stable-3_5_0.diff applied (bin/try-fix.js).
//
//   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature <f> --reset --apps ojs,ops
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=<f> PROBE_AGENT=<id> [ONLY=ojs] node bin/probe.js <ojs|ops|all> \
//     shared/playwright/checks/sync/pkp-lib-10744/cli-worker.js
//
// Reads fixed when: s1-facts' failedJobs holds no UpdateSubmissionSearchJob or MetadataChangedJob (only the
// DepositOrcid* jobs, which fail at the fleet's dead [proxy]), and depositUrls name the item's own journal path
// (…/<context path>/article/view/<id>, OPS …/preprint/view/<id>), never …/index/…. At the 3.5 tip: the
// verified item's search and metadata jobs in failed_jobs, "Call to a member function getLocalizedName() on
// null", CitationStyleLanguagePlugin.php line 461; the control's jobs Processed.
//
// Facts: s1-facts-<app>.json; screenshots s1-front-search-<app>.png, s1-failed-jobs-<app>.png.
const path = require('path');
const kit = require('../../../probe');
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, tag, sql, serverLog, drainJobs} = kit;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

async function setContributorRole(page, app, cp, s) {
    // 3.5: the seeded contributor has no user group (harness.md "3.5: the main overlays"); the 3.5 wizard sets
    // the Author group. Set it the way an editor does: Contributors > Edit > role "Author" > Save.
    const r = {};
    await page.goto(app.url(`/index.php/${cp}/en/dashboard/editorial?workflowSubmissionId=${s.submissionId}`));
    await idle(page);
    const link = page.getByRole('link', {name: 'Contributors'}).or(page.getByRole('button', {name: 'Contributors'})).first();
    await link.click({timeout: 30_000}).catch((e) => { r.menu = flat(e.message, 200); });
    await idle(page);
    const edit = page.getByRole('button', {name: /^Edit/}).first();
    await edit.click({timeout: 30_000}).catch((e) => { r.edit = flat(e.message, 200); });
    await idle(page);
    await page.locator('input[name="userGroupId"]').first().waitFor({state: 'attached', timeout: 30_000}).catch((e) => { r.radioWait = flat(e.message, 200); });
    r.radios = await page.locator('input[name="userGroupId"]').evaluateAll((els) => els.map((e) => ({value: e.value, label: (e.closest('label') || {}).innerText, visible: e.getClientRects().length > 0, checked: e.checked})));
    const authorRadio = page.locator('label').filter({hasText: /^\s*Author\s*$/}).locator('input[name="userGroupId"]').first();
    if (await authorRadio.count()) {
        await authorRadio.check({force: true}).catch((e) => { r.radio = flat(e.message, 200); });
    }
    const country = page.locator('select[name="country"]:visible').first();
    if (await country.count() && !(await country.inputValue())) {
        await country.selectOption('CA');
        r.country = 'CA';
    }
    const saved = page.waitForResponse((x) => /contributors\/\d+/.test(x.url()) && x.request().method() !== 'GET', {timeout: 30_000}).catch(() => null);
    await page.getByRole('button', {name: 'Save', exact: true}).last().click({timeout: 30_000}).catch((e) => { r.save = flat(e.message, 200); });
    const sv = await saved;
    r.saveStatus = sv ? sv.status() : null;
    await idle(page);
    if (r.saveStatus !== 200) {
        record(`role-${s.submissionId}`, await screen(page));
        await shot(page, `role-${s.submissionId}`);
    }
    r.userGroup = sql(app, `select user_group_id from authors where publication_id=${s.publicationId}`).trim();
    return r;
}

async function publishOnScreen(page, app, cp, s) {
    const r = {};
    await page.goto(app.url(`/index.php/${cp}/en/dashboard/editorial?workflowSubmissionId=${s.submissionId}`));
    await idle(page);
    const link = page.getByRole('link', {name: 'Contributors'}).or(page.getByRole('button', {name: 'Contributors'})).first();
    await link.click({timeout: 30_000}).catch((e) => { r.menu = flat(e.message, 200); });
    await idle(page);
    const header = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: /^(Publish|Post|Schedule For Publication)$/});
    await header.first().waitFor({state: 'visible', timeout: 30_000});
    r.headerButton = flat(await header.first().innerText());
    await header.first().click();
    const issueSel = page.locator('select[name="issueId"]:visible');
    if (await issueSel.waitFor({state: 'visible', timeout: 8_000}).then(() => true).catch(() => false)) {
        const val = await issueSel.locator('option').evaluateAll((os) => (os.find((o) => /Vol\. 1/.test(o.textContent)) || {}).value);
        await issueSel.selectOption(val);
        r.assignedIssue = val;
        await page.getByRole('button', {name: 'Save', exact: true}).last().click();
    }
    const modal = page.locator('.pkpWorkflow__publishModal').last();
    await modal.waitFor({state: 'visible', timeout: 30_000}).catch((e) => { r.modalWait = flat(e.message, 200); });
    await idle(page);
    await sleep(800);
    r.modalText = flat(await modal.innerText().catch(() => null), 500);
    const pub = modal.getByRole('button', {name: /^(Publish|Post|Schedule For Publication|Schedule)$/}).last();
    const posted = page.waitForResponse((x) => /\/publications\/\d+\/publish$/.test(new URL(x.url()).pathname) && x.request().method() !== 'GET', {timeout: 30_000}).catch(() => null);
    await pub.click();
    const p = await posted;
    r.publish = p ? p.status() : 'no request';
    await idle(page);
    await sleep(1000);
    r.dbStatus = sql(app, `select status from publications where publication_id=${s.publicationId}`);
    return r;
}

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const t = tag('rr10744');
    const out = {app: app.name, line: app.line};
    const ctx = await app.api.createContext({
        tag: t,
        context: {name: `RR10744 ${t}`, contactName: 'Orla Contact', contactEmail: `${t}c@mail.test`},
        users: [
            {username: `${t}mg`, roles: ['manager']},
            {username: `${t}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author'},
            ...(isOJS ? [{username: `${t}rv`, roles: ['externalReviewer'], givenName: 'Rene', familyName: 'Reviewer'}] : []),
        ],
        orcid: {enabled: true, apiType: 'memberSandbox', city: 'Vancouver'},
        ...(isOJS ? {issues: [{volume: 1, number: 1, year: 2026, published: true}]} : {}),
    });
    const cp = ctx.path || t;
    out.context = cp;
    const ctxId = sql(app, `select ${app.contextTables.id} from ${app.contextTables.table} where path='${cp}'`).trim();
    out.contextId = ctxId;
    const base = (key, extra) => ({
        tag: `${t}${key}`.slice(0, 32), context: cp, submitter: `${t}au`, title: `Zyxquorl ${key} ${t}`,
        ...(isOJS ? {decisions: ['skipExternalReview', 'sendToProduction'], galleys: [{label: 'PDF', file: 'article.pdf'}], issue: {volume: 1, number: 1, year: 2026}} : {galleys: [{label: 'PDF', file: 'preprint.pdf'}]}),
        ...extra,
    });
    const subs = {
        verified: await app.api.createSubmission(base('verified', {author: {orcid: 'https://orcid.org/0000-0002-1825-0097', orcidIsVerified: true}})),
        control: await app.api.createSubmission(base('control', {author: {orcid: 'https://orcid.org/0000-0002-1825-0097', orcidIsVerified: false}})),
    };
    if (isOJS) {
        subs.declinedReview = await app.api.createSubmission(base('declined', {
            decisions: ['sendExternalReview', 'accept', 'sendToProduction'],
            reviewRounds: [{reviewers: [{username: `${t}rv`, status: 'declined'}]}],
        }));
    }
    out.subs = Object.fromEntries(Object.entries(subs).map(([k, v]) => [k, [v.submissionId, v.publicationId]]));
    console.log(`[seed] ${app.name} ctx=${cp} (${ctxId})`, out.subs);
    out.authorRows = sql(app, `select a.author_id, a.publication_id, s.setting_name, left(s.setting_value, 40) from authors a join author_settings s on s.author_id=a.author_id where a.publication_id in (${Object.values(subs).map((s) => s.publicationId).join(',')}) and s.setting_name like 'orcid%' order by 1,3`).split('\n');

    const startTs = sql(app, `select to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`).trim();
    out.startTs = startTs;
    const maxFailed = Number(sql(app, 'select coalesce(max(id),0) from failed_jobs').trim());
    const maxJob = Number(sql(app, 'select coalesce(max(id),0) from jobs').trim());
    out.queueBefore = sql(app, `select id, substring(payload from '"displayName":"([^"]+)"') from jobs where id > 0 order by id`).split('\n').filter(Boolean);

    const {page, close} = await launch(app);
    const log = serverLog(app);
    const from = log.mark();
    try {
        await signIn(page, `${t}mg`, {contextPath: cp});
        await idle(page);
        out.roles = {};
        for (const [k, s] of Object.entries(subs)) {
            out.roles[k] = await setContributorRole(page, app, cp, s);
            console.log(`[role] ${app.name} ${k}: ${JSON.stringify(out.roles[k])}`);
        }
        if (Object.values(out.roles).some((r) => !r.userGroup)) {
            throw new Error('contributor role not set: ' + JSON.stringify(out.roles));
        }
        out.publish = {};
        for (const [k, s] of Object.entries(subs)) {
            out.publish[k] = await publishOnScreen(page, app, cp, s);
            console.log(`[publish] ${app.name} ${k}: ${JSON.stringify(out.publish[k]).slice(0, 400)}`);
        }
        out.publishServerLog = log.since(from);
        await signOut(page);

        // what the publish requests queued
        out.queuedByPublish = sql(app, `select id, substring(payload from '"displayName":"([^"]+)"') from jobs where id > ${maxJob} order by id`).split('\n').filter(Boolean);
        console.log(`[queued] ${app.name}`, out.queuedByPublish);

        // the CLI worker, as a cron install runs it
        const drained = await drainJobs(app);
        out.drain = {passes: drained.passes, counts: drained.counts, output: drained.output.split('\n').filter((l) => /DONE|FAIL|RUNNING|Processing|Processed|Failed|Error|error/i.test(l)).slice(0, 80)};
        console.log(`[drain] ${app.name}`, JSON.stringify(out.drain).slice(0, 2000));

        out.failedJobs = sql(app, `select id, substring(payload from '"displayName":"([^"]+)"'), regexp_replace(left(exception, 260), '\\s+', ' ', 'g') from failed_jobs where id > ${maxFailed} order by id`).split('\n').filter(Boolean);
        // which submission each failed job concerned
        out.failedJobsPayloadIds = sql(app, `select id, substring(payload from 'submissionId\\\\";i:([0-9]+)'), substring(payload from 'reviewAssignmentId\\\\";i:([0-9]+)') from failed_jobs where id > ${maxFailed} order by id`).split('\n').filter(Boolean);
        console.log(`[failed] ${app.name}`, out.failedJobs, out.failedJobsPayloadIds);
        // the citation each ORCID deposit job carries (queued from the publish request or the search job)
        out.depositUrls = sql(app, `select id, substring(replace(payload, '\\/', '/') from 'https?://[^"\\\\ ]*/(?:article|preprint)/view/[0-9A-Za-z_-]+') from failed_jobs where id > ${maxFailed} and payload like '%DepositOrcidSubmission%' union all select id, substring(replace(payload, '\\/', '/') from 'https?://[^"\\\\ ]*/(?:article|preprint)/view/[0-9A-Za-z_-]+') from jobs where id > ${maxJob} and payload like '%DepositOrcidSubmission%' order by 1`).split('\n').filter(Boolean);
        out.jobsLeft = sql(app, `select id, substring(payload from '"displayName":"([^"]+)"'), attempts from jobs where id > ${maxJob} order by id`).split('\n').filter(Boolean);

        // search index per submission: object types and keyword counts
        out.searchIndex = {};
        for (const [k, s] of Object.entries(subs)) {
            out.searchIndex[k] = sql(app, `select o.type, count(k.keyword_id) from submission_search_objects o left join submission_search_object_keywords k on k.object_id=o.object_id where o.submission_id=${s.submissionId} group by o.type order by o.type`).split('\n').filter(Boolean);
        }
        out.reviewAssignments = isOJS ? sql(app, `select review_id, submission_id, reviewer_id, declined, date_completed from review_assignments where submission_id=${subs.declinedReview.submissionId}`).split('\n') : null;

        // the front end: search the unique title word
        await page.goto(app.url(`/index.php/${cp}/search/search?query=Zyxquorl`));
        await idle(page);
        const s = await screen(page);
        out.frontSearch = flat(s.text.main || s.text.body || JSON.stringify(s.text), 900);
        await shot(page, 's1-front-search');

        // Administration > Failed Jobs, as the admin
        await signIn(page, 'admin');
        await idle(page);
        const listResp = page.waitForResponse((x) => /jobs\/failed\/all/.test(x.url()), {timeout: 30_000}).catch(() => null);
        await page.goto(app.url('/index.php/index/en/admin/failedJobs'));
        const lr = await listResp;
        await idle(page);
        await sleep(800);
        if (lr) {
            const body = await lr.json().catch(() => null);
            out.failedJobsApi = body ? {total: body.total, rows: (body.data || []).filter((d) => Number(d.id) > maxFailed).map((d) => ({id: d.id, displayName: d.displayName, failedAt: d.failed_at || d.failedAt, exception: flat(d.exception, 200)}))} : null;
        }
        record('s1-failed-jobs-screen', await screen(page));
        await shot(page, 's1-failed-jobs');
        out.serverLog = log.since(from).slice(0, 40);
    } finally {
        record('s1-facts', out);
        await close();
    }
});
