// PR review of pkp/pkp-lib#13814 (issue pkp/pkp-lib#13813; ojs#6088 the pointer): a merge hands the
// merged account's public comments and reports to the account it is merged into (U14 A16), and
// the notification clean-up moves into Repo::userComment()->deleteNotifications(), now also called
// when a publication is deleted (U14 A10's submission half).
// One scratch journal (OJS; the reader side is OJS-only), as its Journal Manager unless said:
//   merge     B (rb) merged into A (ra) through "Merge user": B's comment and B's report on A's
//             comment, by user_id in the DB, and B's comment on the landing page
//   delComm   DELETE comments/{id} on a comment with a report: status, rows and tasks left
//   delRep    DELETE comments/{id}/reports/{rid}: status, rows and tasks left
//   delSub    a second article with a reported comment, unpublished and deleted (DELETE
//             submissions/{id}): status, the submission, comment and task rows left
//   delCtx    a second scratch journal with a commented article, deleted by admin
//             (DELETE /index/api/v1/contexts/{id}): status, the context row left
//   delCtx0   the same with a journal whose article has no comment (round 2: the guard dropped)
//   cliDel    `php tools/deleteSubmissions.php <id>` on an article with no comment (no context
//             in a CLI request): exit, output, the submission row left; cliDelC the same with a comment
// Each phase records the HTTP status, the server log's new error lines and the rows.
//   PROBE_FEATURE=sync PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13814/walk.js
const path = require('path');
const {spawnSync} = require('child_process');
const ROOT = path.resolve(__dirname, '../../../../..');
const {forEachApp, launch, signIn, signOut, record, tag, sql, apiAs, serverLog} = require('../../../probe');

const COMMENT = 0x0100010;
const REPORT = 0x0100011;

forEachApp(async (app) => {
    if (app.name !== 'ojs') {
        console.log(`${app.name}: no reader-side comments; skipped`);
        return;
    }
    const {UsersPage} = require(path.join(ROOT, 'apps/ojs/playwright/pages/ReaderCommentsPages.js'));
    const out = {app: app.name, pkpLib: process.env.PKP_LIB_SHA || null, phases: {}};
    const log = serverLog(app);
    const T = tag('p');
    const u = (ctx, k, roles) => ({username: `${ctx}${k}`, givenName: k, familyName: 'Probe', email: `${ctx}${k}@mail.test`, roles});
    const users = ['mg', 'au', 'ra', 'rb'];
    const mkCtx = (ctx) => app.api.createContext({tag: ctx, enablePublicComments: true,
        users: users.map((k) => u(ctx, k, k === 'mg' ? ['manager'] : k === 'au' ? ['author'] : ['reader']))});
    const uid = (name) => Number(sql(app, `select user_id from users where username = '${name}'`));
    const notes = (type, ids) => (ids.length
        ? Number(sql(app, `select count(*) from notifications where assoc_type = ${type} and assoc_id in (${ids.join(',')})`))
        : 0);
    const phase = async (name, fn) => {
        const from = log.mark();
        try {
            out.phases[name] = await fn();
        } catch (e) {
            out.phases[name] = {threw: String(e.message || e).slice(0, 400)};
        }
        out.phases[name].serverErrors = log.since(from).map((l) => l.slice(0, 300)).slice(0, 6);
        console.log(app.name, name, JSON.stringify(out.phases[name]));
    };

    await mkCtx(T);
    const ctxId = Number(sql(app, `select journal_id from journals where path = '${T}'`));
    const ra = `${T}ra`, rb = `${T}rb`, mg = `${T}mg`;
    const art = await app.api.createSubmission({tag: `${T}x`, context: T, submitter: `${T}au`, title: `Article ${T}`, published: true,
        userComments: [
            {user: ra, text: `A comment ${T}.`, approved: true, reports: [{user: rb, note: `B report ${T}.`}]},
            {user: rb, text: `B comment ${T}.`, approved: true},
            {user: ra, text: `A second comment ${T}.`, approved: true, reports: [{user: `${T}au`, note: `B second report ${T}.`}]},
            {user: ra, text: `A third comment ${T}.`, approved: true, reports: [{user: `${T}au`, note: `B third report ${T}.`}]},
        ]});
    const [cA, cB, cA2, cA3] = art.userComments.map((c) => c.id);
    const [rB] = art.userComments[0].reports;
    const [rB2] = art.userComments[2].reports;
    const [rB3] = art.userComments[3].reports;

    const {page, close} = await launch(app);
    await signIn(page, mg, {contextPath: T});

    await phase('merge', async () => {
        const before = {ra: uid(ra), rb: uid(rb)};
        const usersPage = new UsersPage(page, T);
        await usersPage.goto(rb);
        await usersPage.mergeUser(rb, ra);
        const rows = sql(app, `select user_comment_id, user_id from user_comments where user_comment_id in (${cA},${cB}) order by 1`);
        const reps = sql(app, `select user_comment_report_id, user_id from user_comment_reports where user_comment_report_id in (${rB},${rB2},${rB3}) order by 1`);
        await page.goto(`/index.php/${T}/article/view/${art.submissionId}`);
        await page.getByText(`A comment ${T}.`).first().waitFor({timeout: 30_000});
        const landing = await page.getByText(`B comment ${T}.`).count();
        return {before, rbLeft: sql(app, `select count(*) from users where username = '${rb}'`), comments: rows, reports: reps,
            bCommentOnLanding: landing,
            tasksAboutB: notes(COMMENT, [cB]) + notes(REPORT, [rB, rB2, rB3])};
    });

    await page.goto(`/index.php/${T}/management/settings/userComments`);
    await phase('delComm', async () => {
        const res = await apiAs(page, 'DELETE', `comments/${cA2}`);
        return {status: res.status(), body: (await res.text()).slice(0, 200),
            commentLeft: sql(app, `select count(*) from user_comments where user_comment_id = ${cA2}`),
            reportLeft: sql(app, `select count(*) from user_comment_reports where user_comment_report_id = ${rB2}`),
            tasksLeft: {comment: notes(COMMENT, [cA2]), report: notes(REPORT, [rB2])}};
    });

    await phase('delRep', async () => {
        const res = await apiAs(page, 'DELETE', `comments/${cA3}/reports/${rB3}`);
        return {status: res.status(), body: (await res.text()).slice(0, 200),
            reportLeft: sql(app, `select count(*) from user_comment_reports where user_comment_report_id = ${rB3}`),
            tasksLeft: {report: notes(REPORT, [rB3])}};
    });

    await phase('delSub', async () => {
        const s = await app.api.createSubmission({tag: `${T}s`, context: T, submitter: `${T}au`, title: `Doomed ${T}`, published: true,
            userComments: [{user: ra, text: `Doomed comment ${T}.`, approved: true, reports: [{user: `${T}au`, note: `Doomed report ${T}.`}]}]});
        const c = s.userComments[0].id, r = s.userComments[0].reports[0];
        const pid = Number(sql(app, `select current_publication_id from submissions where submission_id = ${s.submissionId}`));
        const tasksBefore = {comment: notes(COMMENT, [c]), report: notes(REPORT, [r])};
        const unpub = await apiAs(page, 'PUT', `submissions/${s.submissionId}/publications/${pid}/unpublish`);
        const res = await apiAs(page, 'DELETE', `submissions/${s.submissionId}`);
        const after = await apiAs(page, 'GET', `submissions/${s.submissionId}`);
        const list = await apiAs(page, 'GET', '_submissions?count=100');
        const listed = list.ok() ? ((await list.json()).items || []).some((i) => i.id === s.submissionId) : null;
        return {unpublish: unpub.status(), status: res.status(), body: (await res.text()).slice(0, 200), tasksBefore,
            afterGet: after.status(), dashboardList: list.status(), listedOnDashboard: listed,
            submissionLeft: sql(app, `select count(*) from submissions where submission_id = ${s.submissionId}`),
            publicationLeft: sql(app, `select count(*) from publications where publication_id = ${pid}`),
            commentLeft: sql(app, `select count(*) from user_comments where user_comment_id = ${c}`),
            tasksLeft: {comment: notes(COMMENT, [c]), report: notes(REPORT, [r])}};
    });

    await phase('delCtx', async () => {
        const T2 = `${T}k`;
        await mkCtx(T2);
        const id2 = Number(sql(app, `select journal_id from journals where path = '${T2}'`));
        const s = await app.api.createSubmission({tag: `${T2}s`, context: T2, submitter: `${T2}au`, title: `Gone ${T2}`, published: true,
            userComments: [{user: `${T2}ra`, text: `Gone comment ${T2}.`, approved: true}]});
        const c = s.userComments[0].id;
        await signOut(page);
        await signIn(page, 'admin');
        await page.goto('/index.php/index/admin/contexts');
        const csrf = await page.evaluate(() => (window.pkp && pkp.currentUser && pkp.currentUser.csrfToken) || null);
        const res = await page.request.fetch(`/index.php/index/api/v1/contexts/${id2}`, {method: 'DELETE', headers: {'X-Csrf-Token': csrf}, failOnStatusCode: false});
        return {status: res.status(), body: (await res.text()).slice(0, 200),
            contextLeft: sql(app, `select count(*) from journals where journal_id = ${id2}`),
            submissionLeft: sql(app, `select count(*) from submissions where submission_id = ${s.submissionId}`),
            commentLeft: sql(app, `select count(*) from user_comments where user_comment_id = ${c}`)};
    });

    await phase('delCtx0', async () => {
        const T3 = `${T}z`;
        await mkCtx(T3);
        const id3 = Number(sql(app, `select journal_id from journals where path = '${T3}'`));
        const s = await app.api.createSubmission({tag: `${T3}s`, context: T3, submitter: `${T3}au`, title: `Plain ${T3}`, published: true});
        await page.goto('/index.php/index/admin/contexts');
        const csrf = await page.evaluate(() => (window.pkp && pkp.currentUser && pkp.currentUser.csrfToken) || null);
        const res = await page.request.fetch(`/index.php/index/api/v1/contexts/${id3}`, {method: 'DELETE', headers: {'X-Csrf-Token': csrf}, failOnStatusCode: false});
        return {status: res.status(), body: (await res.text()).slice(0, 200),
            contextLeft: sql(app, `select count(*) from journals where journal_id = ${id3}`),
            submissionLeft: sql(app, `select count(*) from submissions where submission_id = ${s.submissionId}`),
            publicationsLeft: sql(app, `select count(*) from publications where submission_id = ${s.submissionId}`)};
    });

    for (const [name, withComment] of [['cliDel', false], ['cliDelC', true]]) await phase(name, async () => {
        const s = await app.api.createSubmission({tag: `${T}${withComment ? 'd' : 'c'}`, context: T, submitter: `${T}au`, title: `CLI ${T}`, published: true,
            ...(withComment ? {userComments: [{user: ra, text: `CLI comment ${T}.`, approved: true}]} : {})});
        const r = spawnSync('php', ['tools/deleteSubmissions.php', String(s.submissionId)],
            {cwd: path.resolve(ROOT, app.root), env: {...process.env, PKP_CONFIG_FILE: app.configFile}, encoding: 'utf8', timeout: 120000});
        const o = `${r.stdout || ''}${r.stderr || ''}`.trim();
        return {exit: r.status, error: (o.match(/(PHP )?Fatal error:.*|Uncaught .*/) || [o.slice(0, 200)])[0].slice(0, 300),
            submissionLeft: sql(app, `select count(*) from submissions where submission_id = ${s.submissionId}`),
            publicationsLeft: sql(app, `select count(*) from publications where submission_id = ${s.submissionId}`)};
    });

    out.contextId = ctxId;
    record(`walk-${process.env.WALK_REF || 'pr'}`, out);
    await close();
});
