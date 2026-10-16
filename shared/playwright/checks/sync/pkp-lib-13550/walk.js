// PR review of pkp/pkp-lib#13550 (issue pkp/pkp-lib#13539, comments API security): what the PR adds beyond
// U14 A17 and A18 (their own walks under checks/issues/ cover those), on PKP's default test dataset (OJS),
// run after those walks on the same fleet (comments on in publicknowledge by then). A second journal B,
// with a manager and a reader of its own and comments on, acts on publicknowledge's comment and
// publication through B's API (A12, and the PR's journal checks); B's reader, who holds no role in
// publicknowledge, uses the article page there; then the public list's new refusals, the site-level
// address, and the Comments page with comments switched off (A4).
//
//   PROBE_FEATURE=pr13539-<side> PROBE_AGENT=x node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13550/walk.js
//
// Each step records rather than throws, so the base and the head are read alike.
const {forEachApp, launch, signIn, signOut, screen, shot, record, sql, idle, tag, serverLog} = require('../../../probe');
const H17 = require('../../issues/public-comment-list-exposes-reports/lib.js');
const H18 = require('../../issues/comment-request-unpublished-submission/lib.js');

const EDITOR = 'dbarnes';
const WRITER = 'ccorino';
const SUBMISSION = 17;
const PUBLISHED = 18;  // submission 17's published version
const UNPUBLISHED = 5; // submission 4's current version, not published

// fetch from the signed-in page, with its CSRF token, against a context's API
// a signed-in backend page of the context (the profile: every role has it), for its CSRF token
async function profile(page, app, ctx) {
    await page.goto(app.url(`/index.php/${ctx}/en/user/profile`));
    const token = await page.waitForFunction(() => window.pkp && pkp.currentUser && pkp.currentUser.csrfToken, null, {timeout: 30000}).then(() => true).catch(() => false);
    await idle(page);
    return {landed: page.url().replace(/^https?:\/\/[^/]+/, ''), token, user: await page.evaluate(() => window.pkp && pkp.currentUser && pkp.currentUser.username).catch(() => null)};
}

async function api(page, app, ctx, method, path, body) {
    return page.evaluate(async ({base, method, path, body}) => {
        const r = await fetch(base + path, {
            method,
            headers: {'Content-Type': 'application/json', 'X-Csrf-Token': (window.pkp && pkp.currentUser || {}).csrfToken},
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
        return {status: r.status, json, text: json ? undefined : text.replace(/\s+/g, ' ').slice(0, 300)};
    }, {base: app.url(`/index.php/${ctx}/api/v1/`), method, path, body});
}
const brief = (r) => ({status: r.status, id: r.json && r.json.id, contextId: r.json && r.json.contextId,
    isApproved: r.json && r.json.isApproved, error: r.json && !r.json.id ? r.json : undefined, text: r.text});

forEachApp(async (app) => {
    if (app.name !== 'ojs') return record('skipped', {reason: 'OJS only: the comment box is on the article page'});
    const out = {};
    const step = (name, data) => { out[name] = data; record('x', out); };
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    const pk = app.contextPath;
    try {
        // Journal B, comments on, a manager and a reader of its own.
        const b = tag('jb');
        await app.api.createContext({tag: b, enablePublicComments: true,
            users: [{username: `${b}mgr`, roles: ['manager']}, {username: `${b}rdr`, roles: ['reader']}]});
        const mgr = {username: `${b}mgr`, password: `${b}mgr${b}mgr`};
        const rdr = {username: `${b}rdr`, password: `${b}rdr${b}rdr`};
        step('journalB', {path: b, comments: sql(app, `select cs.setting_value from journal_settings cs join journals j on j.journal_id = cs.journal_id where j.path = '${b}' and cs.setting_name = 'enablePublicComments'`).trim()});

        // publicknowledge: comments on; ccorino's comment C, approved.
        await signIn(page, EDITOR);
        step('pk-enable', await H17.enableComments(page, pk));
        await signIn(page, WRITER);
        const text = `x13550 comment ${b}`;
        const written = await H17.writeComment(page, pk, SUBMISSION, text);
        await signIn(page, EDITOR);
        await H17.approve(page, pk, text);
        const c = written.id;
        step('C', {id: c, row: sql(app, `select user_comment_id || ':' || context_id || ':' || is_approved from user_comments where user_comment_id = ${c}`).trim()});

        // A12 and the PR's journal checks: B's manager on C through B's API.
        await signIn(page, mgr.username, {password: mgr.password, contextPath: b});
        step('m0-dashboard', await profile(page, app, b));
        step('m1-get', brief(await api(page, app, b, 'GET', `comments/${c}`)));
        step('m2-getReports', {status: (await api(page, app, b, 'GET', `comments/${c}/reports`)).status});
        step('m3-setApproval', brief(await api(page, app, b, 'PUT', `comments/${c}/setApproval`, {approved: true})));
        step('m4-deleteReports', {status: (await api(page, app, b, 'DELETE', `comments/${c}/reports`)).status});
        // the cross-journal comment, as B's manager (a role in B)
        step('m5-comment-on-pk-publication', brief(await api(page, app, b, 'POST', 'comments', {publicationId: PUBLISHED, commentText: `x13550 by B manager ${b}`})));

        // B's reader: a report on C and a comment on publicknowledge's publication through B's API.
        await signIn(page, rdr.username, {password: rdr.password, contextPath: b});
        step('r0-dashboard', await profile(page, app, b));
        step('r1-report-C-via-B', brief(await api(page, app, b, 'POST', `comments/${c}/reports`, {note: `x13550 report via B ${b}`})));
        step('r2-comment-on-pk-publication-via-B', brief(await api(page, app, b, 'POST', 'comments', {publicationId: PUBLISHED, commentText: `x13550 by B reader via B ${b}`})));

        // B's reader in publicknowledge (no role there): the article page's box and "Report".
        const sent = [];
        const listen = async (res) => {
            if (/\/api\/v1\/comments(\/\d+\/reports)?$/.test(res.url()) && res.request().method() === 'POST') {
                sent.push({url: res.url().replace(/^https?:\/\/[^/]+/, ''), status: res.status(), body: await res.text().catch(() => '')});
            }
        };
        page.on('response', listen);
        const {ArticleCommentsPage} = require('../../../../../apps/ojs/playwright/pages/ReaderCommentsPages.js');
        const landing = new ArticleCommentsPage(page, pk);
        await landing.goto(SUBMISSION);
        await idle(page);
        const offered = await landing.box().count();
        const boxText = `x13550 by B reader on pk page ${b}`;
        let writeError = null;
        if (offered) await landing.writeComment(boxText).catch((e) => { writeError = String(e.message).slice(0, 300); });
        await idle(page);
        step('n1-box', {offered: offered > 0, writeError, shown: await landing.comment(boxText).count(), sent: [...sent], screen: await screen(page)});
        await shot(page, 'n1-no-role-box');
        let reportError = null;
        await landing.goto(SUBMISSION);
        await idle(page);
        try {
            const dialog = await landing.openReportDialog(landing.comment(text));
            await landing.reasonBox(dialog).fill(`x13550 report by B reader on pk page ${b}`);
            await landing.submitReport(dialog);
        } catch (e) { reportError = String(e.message).slice(0, 300); }
        await idle(page);
        step('n2-report', {reportError, sent: [...sent], screen: await screen(page)});
        await shot(page, 'n2-no-role-report');
        page.off('response', listen);

        // The public list: an unpublished id, a mixed list, the site-level address.
        await signOut(page);
        const list = (q, ctx = pk) => H17.openAddress(page, app.url(`/index.php/${ctx}/api/v1/comments/public?${q}`));
        const brief2 = (a) => ({status: a.status, items: a.json && (a.json.data || a.json.items || []).length, error: a.json && a.json.error, text: a.text});
        step('p1-published', brief2(await list(`publicationIds=${PUBLISHED}`)));
        step('p2-unpublished', brief2(await list(`publicationIds=${UNPUBLISHED}`)));
        step('p3-mixed', brief2(await list(`publicationIds[]=${PUBLISHED}&publicationIds[]=${UNPUBLISHED}`)));
        step('p4-site-level', brief2(await list(`publicationIds=${PUBLISHED}`, 'index')));

        // The moderator still reads reports through the public list (the A17 fix keeps them for moderators).
        await signIn(page, EDITOR);
        const mod = await list(`publicationIds=${PUBLISHED}&includeReports=1`);
        step('p5-moderator-includeReports', {status: mod.status, withReports: ((mod.json && (mod.json.data || mod.json.items)) || []).filter((i) => (i.reports || []).length).map((i) => i.id)});

        // Comments off (A4): the Comments page by its address, and the writer deleting their own comment.
        const {CommentsSettingsTab} = require('../../../../../apps/ojs/playwright/pages/ReaderCommentsPages.js');
        const tab = new CommentsSettingsTab(page, pk);
        await tab.goto();
        await tab.box().uncheck();
        await tab.save();
        step('o1-setting', sql(app, `select setting_value from journal_settings where journal_id = 1 and setting_name = 'enablePublicComments'`).trim());
        const cp = await H18.commentsPage(page, app);
        step('o2-comments-page-off', {...cp, screen: undefined, text: cp.screen && cp.screen.text && String(cp.screen.text.main || '').slice(0, 800)});
        await shot(page, 'o2-comments-page-off');
        step('o3-moderator-getMany-off', {status: (await api(page, app, pk, 'GET', 'comments')).status});
        await signIn(page, WRITER);
        await H18.dashboard(page, app, 'mySubmissions');
        step('o4-writer-delete-own-off', {status: (await api(page, app, pk, 'DELETE', `comments/${c}`)).status});
        step('kept', sql(app, `select user_comment_id || ':' || context_id || ':' || publication_id || ':' || is_approved || ':' || comment_text from user_comments order by 1`).split('\n').filter(Boolean));
        step('reports', sql(app, `select user_comment_report_id || ':' || user_comment_id || ':' || note from user_comment_reports order by 1`).split('\n').filter(Boolean));
    } catch (e) {
        step('error', String((e && e.stack) || e).slice(0, 2000));
        throw e;
    } finally {
        step('serverLog', log.since(from));
        await close();
    }
});
