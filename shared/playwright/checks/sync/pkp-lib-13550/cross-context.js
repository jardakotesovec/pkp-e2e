// PR review of pkp/pkp-lib#13539 (pkp-lib#13550): the comments API across two journals of one site
// (pkp/pkp-lib#12972, the issue's point 3), on PKP's default test dataset (OJS only: a press and a
// preprint server have no comment box to write the comments with).
//
//   PROBE_FEATURE=issues-r13539 PROBE_AGENT=base|head PROBE_RUN=xctx node bin/probe.js ojs \
//     shared/playwright/checks/sync/pkp-lib-13550/cross-context.js
//
// Journal A is publicknowledge. Setup: dbarnes ticks "Enable Public Comments"; ccorino writes C1,
// ckwantes C2 and cmontgomerie C3 on submission 17 through the article page's box; dbarnes approves C1
// and C3 (C2 stays pending); lchristopher reports C1 and C3, dsokoloff reports C1. admin creates journal
// B (x13539) through Hosted Journals and ticks its "Enable Public Comments". jjanssen (a Reviewer in A,
// no manager role there) is enrolled in B's "Journal manager" group, and zzedd's roles in A are taken
// away and a Reader role in B given, both by SQL (setup only: nothing in the walk depends on how).
//
// x1-x12: jjanssen, B's manager, sends from a page of B the moderator and signed-in requests on A's
// comments and reports, with B's own API address; x13 is A's public list with includeReports as jjanssen.
// k1-k8 (control): dbarnes, A's moderator, does the same on A (C3 and its report for the writes).
// n1-n2 (ruling, 2026-10-21: an authenticated user needs no role in the journal to comment or report):
// zzedd, who has no role in A, writes a comment and reports C3 through A's article page.
// Each step records rather than throws, so both sides are read.
const {forEachApp, launch, signIn, signOut, record, sql, idle, serverLog} = require('../../../probe');
const A17 = require('../../issues/public-comment-list-exposes-reports/lib.js');
const {createContext} = require('../../issues/all-dates-error-nothing-published/lib.js');

const SUBMISSION = 17;
const PUBLICATION = 18;
const B = 'x13539';
const T = {C1: 'x13539 C1 by ccorino', C2: 'x13539 C2 by ckwantes', C3: 'x13539 C3 by cmontgomerie'};

/** One API request to `api` (the context's API address) with the page's CSRF token, as the app sends it. */
let api = null;
async function call(page, method, path, body) {
    return page.evaluate(async ({api, method, path, body}) => {
        const headers = {'X-Csrf-Token': pkp.currentUser.csrfToken};
        let m = method;
        if (method !== 'GET' && method !== 'POST') {
            headers['X-Http-Method-Override'] = method;
            m = 'POST';
        }
        if (body) headers['Content-Type'] = 'application/json';
        const r = await fetch(api + path, {method: m, headers, body: body ? JSON.stringify(body) : undefined});
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
        return {method, path, status: r.status, json: json ?? undefined, text: json ? undefined : text.slice(0, 300)};
    }, {api, method, path, body});
}

/** The parts of an answer worth keeping: status, error, ids and report counts. */
function brief(r) {
    const j = r.json || {};
    const items = j.items || j.data;
    return {
        status: r.status,
        error: j.error || (r.status >= 400 ? j : undefined),
        id: j.id,
        contextId: j.contextId,
        isApproved: j.isApproved,
        reports: Array.isArray(j.reports) ? j.reports.length : undefined,
        items: Array.isArray(items) ? items.map((i) => ({id: i.id, contextId: i.contextId, reports: Array.isArray(i.reports) ? i.reports.length : undefined, note: i.note && String(i.note).slice(0, 60)})) : undefined,
        note: j.note && String(j.note).slice(0, 60),
        text: r.text,
    };
}

/** A back-office page of `ctx` the user may open, idle, with the CSRF token in place; requests go to ctx's API. */
async function onContext(page, app, ctx) {
    await page.goto(app.url(`/index.php/${ctx}/en/user/profile`));
    await page.waitForFunction(() => window.pkp && pkp.currentUser && pkp.currentUser.csrfToken, null, {timeout: 30_000});
    await idle(page);
    api = app.url(`/index.php/${ctx}/api/v1/`);
    return {landed: page.url().replace(/^https?:\/\/[^/]+/, ''), api: api.replace(/^https?:\/\/[^/]+/, '')};
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') return;
    const A = app.contextPath;
    const out = {};
    const step = (name, data) => { out[name] = data; record('xctx', out); };
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    const state = () => ({
        comments: sql(app, `select user_comment_id || ':' || context_id || ':' || is_approved || ':' || user_id || ':' || comment_text from user_comments order by 1`).split('\n').filter(Boolean),
        reports: sql(app, `select user_comment_report_id || ':' || user_comment_id || ':' || user_id || ':' || note from user_comment_reports order by 1`).split('\n').filter(Boolean),
    });
    try {
        // Setup, journal A.
        await signIn(page, 'dbarnes');
        step('s1-enable-A', await A17.enableComments(page, A));
        for (const [who, key] of [['ccorino', 'C1'], ['ckwantes', 'C2'], ['cmontgomerie', 'C3']]) {
            await signIn(page, who);
            step(`s2-write-${key}`, await A17.writeComment(page, A, SUBMISSION, T[key]));
        }
        await signIn(page, 'dbarnes');
        await A17.approve(page, A, T.C1);
        await A17.approve(page, A, T.C3);
        await signIn(page, 'lchristopher');
        await A17.report(page, A, SUBMISSION, T.C1, 'x13539 R1 on C1 by lchristopher');
        await A17.report(page, A, SUBMISSION, T.C3, 'x13539 R3 on C3 by lchristopher');
        await signIn(page, 'dsokoloff');
        await A17.report(page, A, SUBMISSION, T.C1, 'x13539 R2 on C1 by dsokoloff');
        // Setup, journal B.
        await signIn(page, 'admin');
        step('s3-create-B', await createContext(page, app, {name: 'x13539 Journal B', initials: 'X13539', path: B, email: 'x13539@mailinator.com'}));
        step('s4-enable-B', await A17.enableComments(page, B));
        const bId = sql(app, `select journal_id from journals where path = '${B}'`);
        const bManagers = sql(app, `select min(user_group_id) from user_groups where context_id = ${bId} and role_id = 16`);
        const bReaders = sql(app, `select min(user_group_id) from user_groups where context_id = ${bId} and role_id = 1048576`);
        sql(app, `insert into user_user_groups (user_group_id, user_id, date_start) select ${bManagers}, user_id, now() from users where username = 'jjanssen'`);
        sql(app, `delete from user_user_groups where user_id = (select user_id from users where username = 'zzedd')`);
        sql(app, `insert into user_user_groups (user_group_id, user_id, date_start) select ${bReaders}, user_id, now() from users where username = 'zzedd'`);
        const id = (text) => sql(app, `select user_comment_id from user_comments where comment_text = '${text}'`);
        const rid = (note) => sql(app, `select user_comment_report_id from user_comment_reports where note = '${note}'`);
        const ids = {B: bId, C1: id(T.C1), C2: id(T.C2), C3: id(T.C3), R1: rid('x13539 R1 on C1 by lchristopher'), R2: rid('x13539 R2 on C1 by dsokoloff'), R3: rid('x13539 R3 on C3 by lchristopher')};
        step('s5-ids', ids);
        step('s6-state', state());

        // Control reads: A's moderator on A.
        await signIn(page, 'dbarnes');
        step('k0-api', await onContext(page, app, A));
        step('k1-get', brief(await call(page, 'GET', `comments/${ids.C1}`)));
        step('k2-reports', brief(await call(page, 'GET', `comments/${ids.C1}/reports`)));
        step('k3-report', brief(await call(page, 'GET', `comments/${ids.C1}/reports/${ids.R1}`)));
        step('k4-public-includeReports', brief(await call(page, 'GET', `comments/public?publicationIds=${PUBLICATION}&includeReports=1`)));

        // Cross-context: B's manager, from B, on A's comments.
        await signIn(page, 'jjanssen');
        step('x0-api', await onContext(page, app, B));
        step('x1-get', brief(await call(page, 'GET', `comments/${ids.C1}`)));
        step('x2-reports', brief(await call(page, 'GET', `comments/${ids.C1}/reports`)));
        step('x3-report', brief(await call(page, 'GET', `comments/${ids.C1}/reports/${ids.R1}`)));
        step('x4-list', brief(await call(page, 'GET', 'comments')));
        step('x5-public-B', brief(await call(page, 'GET', `comments/public?publicationIds=${PUBLICATION}&includeReports=1`)));
        step('x6-approve-C2', brief(await call(page, 'PUT', `comments/${ids.C2}/setApproval`, {approved: true})));
        step('x7-report-C1', brief(await call(page, 'POST', `comments/${ids.C1}/reports`, {note: 'x13539 report sent through B'})));
        step('x8-comment-on-A', brief(await call(page, 'POST', 'comments', {publicationId: PUBLICATION, commentText: 'x13539 comment sent through B'})));
        step('x9-delete-R1', brief(await call(page, 'DELETE', `comments/${ids.C1}/reports/${ids.R1}`)));
        step('x10-delete-all-C1', brief(await call(page, 'DELETE', `comments/${ids.C1}/reports`)));
        step('x11-delete-C2', brief(await call(page, 'DELETE', `comments/${ids.C2}`)));
        // A's own address, as jjanssen (no manager role in A).
        step('x12-api-A', await onContext(page, app, A));
        step('x13-public-A-includeReports', brief(await call(page, 'GET', `comments/public?publicationIds=${PUBLICATION}&includeReports=1`)));
        step('x14-state', state());

        // Control writes: A's moderator on C3.
        await signIn(page, 'dbarnes');
        await onContext(page, app, A);
        step('k5-unapprove-C3', brief(await call(page, 'PUT', `comments/${ids.C3}/setApproval`, {approved: false})));
        step('k6-approve-C3', brief(await call(page, 'PUT', `comments/${ids.C3}/setApproval`, {approved: true})));
        step('k7-delete-R3', brief(await call(page, 'DELETE', `comments/${ids.C3}/reports/${ids.R3}`)));
        step('k8-delete-all-C1', brief(await call(page, 'DELETE', `comments/${ids.C1}/reports`)));

        // Ruling: no role in A, still comments and reports through A's article page.
        await signIn(page, 'zzedd');
        step('n1-write', await A17.writeComment(page, A, SUBMISSION, 'x13539 comment by zzedd, no role in A').catch((e) => ({error: String(e).slice(0, 300)})));
        step('n2-report-C3', await A17.report(page, A, SUBMISSION, T.C3, 'x13539 report by zzedd, no role in A').then(() => 'sent').catch((e) => ({error: String(e).slice(0, 300)})));
        step('n3-state', state());
    } catch (e) {
        step('error', String((e && e.stack) || e).slice(0, 2000));
        throw e;
    } finally {
        step('serverLog', log.since(from));
        await signOut(page).catch(() => {});
        await close();
    }
});
