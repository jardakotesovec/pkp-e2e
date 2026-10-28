// Merge check of pkp/pkp-lib#13550 (issue pkp/pkp-lib#13539): the merged head 7bc35ed8df changed one
// thing after round 3's 035769b365, a report on an unapproved comment by a non-moderator refused with
// 404 "api.404.resourceNotFound" in place of 403 "api.403.unauthorized" (AddReport). On PKP's default
// test dataset, OJS only (a press and a preprint server have no comment box).
//
//   PROBE_FEATURE=issues-r13539 PROBE_AGENT=merge PROBE_RUN=<side> node bin/probe.js ojs \
//     shared/playwright/checks/sync/pkp-lib-13550/unapproved-report.js
//
// Setup: dbarnes ticks "Enable Public Comments"; ccorino writes C1 and ckwantes C2 on submission 17;
// dbarnes approves C1 only (C2 stays pending). u1: lchristopher reports C2; u2 (control): lchristopher
// reports C1; u3: ckwantes reports her own pending C2; u4 (control): dbarnes, a moderator, reports C2.
// Each step records rather than throws, so both sides are read.
const {forEachApp, launch, signIn, record, sql, idle, serverLog} = require('../../../probe');
const A17 = require('../../issues/public-comment-list-exposes-reports/lib.js');

const SUBMISSION = 17;
const RUN = process.env.PROBE_RUN || 'r1';
const T = {C1: `u13550 C1 by ccorino ${RUN}`, C2: `u13550 C2 by ckwantes ${RUN}`};

/** One POST to the context's API with the page's CSRF token: the status and the error key. */
async function report(page, app, ctx, commentId, note) {
    await page.goto(app.url(`/index.php/${ctx}/en/user/profile`));
    await page.waitForFunction(() => window.pkp && pkp.currentUser && pkp.currentUser.csrfToken, null, {timeout: 30_000});
    await idle(page);
    const api = app.url(`/index.php/${ctx}/api/v1/`);
    return page.evaluate(async ({api, commentId, note}) => {
        const r = await fetch(`${api}comments/${commentId}/reports`, {
            method: 'POST',
            headers: {'X-Csrf-Token': pkp.currentUser.csrfToken, 'Content-Type': 'application/json'},
            body: JSON.stringify({note}),
        });
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
        return {status: r.status, error: json && json.error, id: json && json.id, text: json ? undefined : text.slice(0, 200)};
    }, {api, commentId, note});
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') return;
    const A = app.contextPath;
    const out = {pkpLib: process.env.PKP_LIB_AT || null};
    const step = (name, data) => { out[name] = data; record(`unapproved-${RUN}`, out); };
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    const id = (text) => sql(app, `select user_comment_id from user_comments where comment_text like '%${text}%' order by 1 desc limit 1`);
    const reports = (cid) => sql(app, `select count(*) from user_comment_reports where user_comment_id = ${cid}`);
    try {
        await signIn(page, 'dbarnes');
        step('s1-enable', await A17.enableComments(page, A));
        for (const [who, key] of [['ccorino', 'C1'], ['ckwantes', 'C2']]) {
            await signIn(page, who);
            step(`s2-write-${key}`, await A17.writeComment(page, A, SUBMISSION, T[key]));
        }
        await signIn(page, 'dbarnes');
        await A17.approve(page, A, T.C1);
        const ids = {C1: id(T.C1), C2: id(T.C2)};
        step('s3-ids', {...ids, approved: sql(app, `select user_comment_id || ':' || is_approved from user_comments where user_comment_id in (${ids.C1}, ${ids.C2}) order by 1`).split('\n')});

        await signIn(page, 'lchristopher');
        step('u1-reader-reports-pending-C2', await report(page, app, A, ids.C2, 'u13550 report on pending C2'));
        step('u2-reader-reports-approved-C1', await report(page, app, A, ids.C1, 'u13550 report on approved C1'));
        await signIn(page, 'ckwantes');
        step('u3-writer-reports-own-pending-C2', await report(page, app, A, ids.C2, 'u13550 own report on pending C2'));
        await signIn(page, 'dbarnes');
        step('u4-moderator-reports-pending-C2', await report(page, app, A, ids.C2, 'u13550 moderator report on pending C2'));
        step('s4-reports', {C1: reports(ids.C1), C2: reports(ids.C2)});
    } catch (e) {
        step('error', String((e && e.stack) || e).slice(0, 2000));
    } finally {
        step('serverLog', log.since(from));
        await close();
    }
});
