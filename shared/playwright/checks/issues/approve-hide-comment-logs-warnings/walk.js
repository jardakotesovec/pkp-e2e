// U14 A25: every "Approve Comment" or "Hide Comment" on the Comments page writes two PHP warnings to the
// server's error log. Takes the steps of docs/issues/U14-A25-approve-hide-comment-logs-warnings.md on PKP's
// default test dataset, on the three apps (OMP and OPS: the reader's comment goes through the request the
// report's console snippet sends, since no screen there writes one), reading the fleet's server log per step.
//
//   default mode (the report's steps):
//     PROBE_FEATURE=issues-n16b PROBE_AGENT=n16b node bin/probe.js all shared/playwright/checks/issues/approve-hide-comment-logs-warnings/walk.js
//   neighbour mode (what the fix must leave alone: the panel's "approved on … by …" note after an approval
//   and its plain note after hiding, the approval date and approver the page's own list request returns, the stored settings, and on OJS the approved comment on the article's page):
//     PROBE_RUN=nb-in … walk.js neighbour
//
// Every step records rather than throws, so a fixed app (no warnings) is read the same way.
const {forEachApp, launch, signIn, record, shot, note, serverLog, sql} = require('../../../probe');
const H = require('./lib.js');

const MODE = process.argv[2] || 'walk';
const EDITOR = 'dbarnes';
const READER = {
    ojs: {user: 'ccorino', submissionId: 17},
    omp: {user: 'zzedd', publicationId: 5},
    ops: {user: 'ccorino', publicationId: 2},
};

forEachApp(async (app) => {
    const ctx = app.contextPath;
    const reader = READER[app.name];
    const log = serverLog(app);
    const {page, close} = await launch(app);
    const out = {mode: MODE, line: app.line || 'main', app: app.name};
    const step = (name, data) => { out[name] = data; record(MODE, out); };
    // The server-log lines written since `from`: every warning/error, and the two this entry is about.
    const logSince = (from) => {
        const lines = log.since(from).map((l) => l.replace(/^\[[^\]]+\]\s*/, ''));
        return {count: lines.length, definedType: lines.filter((l) => /have a defined type/.test(l)).length, lines: lines.slice(0, 8)};
    };
    const writeReaderComment = async (text) => {
        if (app.name === 'ojs') {
            await signIn(page, reader.user);
            return {id: await H.writeComment(page, ctx, reader.submissionId, text)};
        }
        await signIn(page, reader.user, {contextPath: ctx});
        return await H.writeCommentByRequest(page, reader.publicationId, text);
    };
    const settingsOf = (id) => (id ? sql(app, `SELECT setting_name, setting_value FROM user_comment_settings WHERE user_comment_id = ${Number(id)} ORDER BY 1`).split('\n').filter(Boolean) : null);
    try {
        let from;
        // Step 1: comments on.
        await signIn(page, EDITOR, {contextPath: ctx});
        from = log.mark();
        step('s1-enable', {...(await H.enableComments(page, ctx)), log: logSince(from)});

        if (MODE === 'neighbour') {
            const text = 'u14n16b neighbour comment';
            const made = await writeReaderComment(text);
            step('n-comment', made);
            await signIn(page, EDITOR, {contextPath: ctx});
            let comments = await H.openCommentsPage(page, ctx);
            await H.viewComment(page, comments, text);
            from = log.mark();
            step('n-approve', {...(await H.press(page, comments, 'Approve Comment')), log: logSince(from)});
            comments = await H.openCommentsPage(page, ctx);
            const approvedPanel = await H.viewComment(page, comments, text);
            step('n-approved-panel', {...approvedPanel, listed: await H.listedComment(page, made.id), stored: settingsOf(made.id)});
            await shot(page, `${MODE}-approved-panel`);
            await comments.closeCommentPanel().catch(() => {});
            if (app.name === 'ojs') {
                // A signed-out visitor sees the approved comment on the article's page.
                await page.context().clearCookies();
                const {ArticleCommentsPage} = H.po();
                const landing = new ArticleCommentsPage(page, ctx);
                from = log.mark();
                await landing.goto(reader.submissionId);
                await page.getByText(text).first().waitFor({timeout: 15_000}).catch(() => {});
                step('n-landing', {
                    shown: await page.getByText(text).count(),
                    allComments: H.flat(await page.getByText(/All Comments \(\d+\)/).first().innerText().catch(() => null)),
                    log: logSince(from),
                });
                await signIn(page, EDITOR, {contextPath: ctx});
            }
            comments = await H.openCommentsPage(page, ctx);
            await H.viewComment(page, comments, text);
            from = log.mark();
            step('n-hide', {...(await H.press(page, comments, 'Hide Comment')), log: logSince(from)});
            comments = await H.openCommentsPage(page, ctx);
            const hiddenPanel = await H.viewComment(page, comments, text);
            step('n-hidden-panel', {...hiddenPanel, listed: await H.listedComment(page, made.id), stored: settingsOf(made.id)});
            await shot(page, `${MODE}-hidden-panel`);
            return;
        }

        // Step 2: the reader's comment.
        const text = 'u14n16b comment by ' + reader.user;
        from = log.mark();
        const made = await writeReaderComment(text);
        step('s2-comment', {...made, log: logSince(from)});

        // Step 3: the Comments page (control: nothing logged).
        await signIn(page, EDITOR, {contextPath: ctx});
        from = log.mark();
        let comments = await H.openCommentsPage(page, ctx);
        step('s3-comments-page', {log: logSince(from), row: await comments.row(text).count()});

        // Step 4: "…" › "View Comment" (control).
        from = log.mark();
        step('s4-view', {...(await H.viewComment(page, comments, text)), log: logSince(from)});

        // Steps 5-6: "Approve Comment", then the log.
        from = log.mark();
        const approved = await H.press(page, comments, 'Approve Comment');
        approved.log = logSince(from);
        approved.listed = await H.tabsListing(page, comments, text);
        approved.stored = settingsOf(made.id);
        step('s5-approve', approved);
        await shot(page, `${MODE}-s5-approved`);

        // Steps 7-8: "View Comment" again, "Hide Comment", then the log.
        await H.viewComment(page, comments, text);
        from = log.mark();
        const hidden = await H.press(page, comments, 'Hide Comment');
        hidden.log = logSince(from);
        hidden.listed = await H.tabsListing(page, comments, text);
        hidden.stored = settingsOf(made.id);
        step('s7-hide', hidden);
        await shot(page, `${MODE}-s7-hidden`);
    } catch (e) {
        out.error = String(e.stack || e).slice(0, 1500);
        record(MODE, out);
        note(`n16b ${MODE} ${app.name} stopped: ${String(e).slice(0, 200)}`);
        await shot(page, `${MODE}-error`).catch(() => {});
        throw e;
    } finally {
        await close();
    }
});
