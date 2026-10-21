// PR review of pkp/pkp-lib#13539 (pkp-lib#13550, ui-library#1024): the regression reader's suspicions
// S3-S8 (.reports/sync/rr13550/suspicions.md), on PKP's default test dataset, OJS.
//
//   PROBE_FEATURE=issues-r13539 PROBE_AGENT=base|head PROBE_RUN=extras node bin/probe.js ojs \
//     shared/playwright/checks/sync/pkp-lib-13550/extras.js
//
// e1 (S3) the site-level Comments page address, signed out and as admin; e2 (S4) the site-level public
// list; e3 (S5) with comments off, dbarnes opens the Comments page, with an extra path segment and with a
// trailing slash; e4 (S8) refused comment requests (no body, a non-number id) and what the log took;
// e6 (A14, the ui-library PR) lchristopher opens "Report" on an approved comment, types a reason, the
// comment is deleted underneath (SQL), "Submit": what the page shows.
// Each step records rather than throws, so both sides are read.
const {forEachApp, launch, signIn, signOut, record, sql, idle, screen, serverLog} = require('../../../probe');
const A17 = require('../../issues/public-comment-list-exposes-reports/lib.js');

const SUBMISSION = 17;
const flat = (s, n = 400) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const strip = (u) => (u || '').replace(/^https?:\/\/[^/]+/, '');

async function open(page, path) {
    const r = await page.goto(path).catch((e) => ({error: String(e)}));
    if (!r || r.error) return {path, error: r && r.error};
    await idle(page).catch(() => {});
    const body = await page.locator('body').innerText().catch(() => '');
    return {path, status: r.status(), landed: strip(page.url()), h1: flat(await page.locator('h1').first().innerText().catch(() => null), 120), body: flat(body, 300)};
}

async function post(page, api, path, body) {
    return page.evaluate(async ({api, path, body}) => {
        const r = await fetch(api + path, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Csrf-Token': pkp.currentUser.csrfToken}, body: JSON.stringify(body)});
        const text = await r.text();
        return {path, status: r.status, body: text.slice(0, 300)};
    }, {api, path, body});
}

async function token(page, app, ctx) {
    await page.goto(app.url(`/index.php/${ctx}/en/user/profile`));
    await page.waitForFunction(() => window.pkp && pkp.currentUser && pkp.currentUser.csrfToken, null, {timeout: 30_000});
    await idle(page);
    return app.url(`/index.php/${ctx}/api/v1/`);
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') return;
    const A = app.contextPath;
    const out = {};
    const step = (name, data) => { out[name] = data; record('extras', out); };
    const log = serverLog(app);
    const {page, close} = await launch(app);
    const guard = async (name, fn) => { try { step(name, await fn()); } catch (e) { step(name, {error: flat(e && e.message, 500)}); } };
    try {
        let from = log.mark();
        await guard('e1-site-page-signed-out', () => open(page, app.url('/index.php/index/management/settings/userComments')));
        step('e1-log', log.since(from));
        await signIn(page, 'admin');
        from = log.mark();
        await guard('e1-site-page-admin', () => open(page, app.url('/index.php/index/management/settings/userComments')));
        step('e1-admin-log', log.since(from));
        await signOut(page);
        await guard('e2-site-api', () => open(page, app.url(`/index.php/index/api/v1/comments/public?publicationIds=18`)));

        // Comments are off in the dataset.
        await signIn(page, 'dbarnes');
        await guard('e3-page', () => open(page, app.url(`/index.php/${A}/en/management/settings/userComments`)));
        await guard('e3-page-extra-segment', () => open(page, app.url(`/index.php/${A}/en/management/settings/userComments/x`)));
        await guard('e3-page-trailing-slash', () => open(page, app.url(`/index.php/${A}/en/management/settings/userComments/`)));

        // Comments on from here.
        step('s1-enable-A', await A17.enableComments(page, A));
        await signIn(page, 'ccorino');
        const api = await token(page, app, A);
        from = log.mark();
        await guard('e4-no-body', () => post(page, api, 'comments', {}));
        await guard('e4-bad-id', () => post(page, api, 'comments', {publicationId: 'abc', commentText: 'x'}));
        await guard('e4-not-current', () => post(page, api, 'comments', {publicationId: 2, commentText: 'x13539e not current'}));
        step('e4-log', log.since(from));

        // e6's comment, approved.
        await signIn(page, 'ckwantes');
        await guard('s2-write-Q', () => A17.writeComment(page, A, SUBMISSION, 'x13539e Q approved by ckwantes'));
        await signIn(page, 'dbarnes');
        await A17.approve(page, A, 'x13539e Q approved by ckwantes');
        const Q = sql(app, `select user_comment_id from user_comments where comment_text = 'x13539e Q approved by ckwantes'`);
        await signIn(page, 'lchristopher');

        // e6: a refused report on the article page.
        const {ArticleCommentsPage} = require('../../../../../apps/ojs/playwright/pages/ReaderCommentsPages.js');
        const landing = new ArticleCommentsPage(page, A);
        await landing.goto(SUBMISSION);
        const dialog = await landing.openReportDialog(landing.comment('x13539e Q approved by ckwantes'));
        await landing.reasonBox(dialog).fill('x13539e reason on a comment deleted underneath');
        sql(app, `delete from user_comments where user_comment_id = ${Q}`);
        const answered = page.waitForResponse((r) => /\/reports$/.test(r.url()) && r.request().method() === 'POST', {timeout: 30_000}).catch(() => null);
        await dialog.getByRole('button', {name: 'Submit', exact: true}).click();
        const r = await answered;
        await page.waitForTimeout(2000); // the windows settle after the answer (open/close animations)
        const dialogs = await page.getByRole('dialog').evaluateAll((ds) => ds.map((d) => ({name: d.getAttribute('aria-label') || (d.querySelector('h1,h2,h3') || {}).innerText, text: d.innerText.slice(0, 300), reason: (d.querySelector('textarea') || {}).value})));
        step('e6-refused-report', {status: r && r.status(), body: r && flat(await r.text().catch(() => ''), 200), dialogs});
        step('e6-screen', await screen(page));
    } catch (e) {
        step('error', String((e && e.stack) || e).slice(0, 2000));
        throw e;
    } finally {
        await signOut(page).catch(() => {});
        await close();
    }
});
