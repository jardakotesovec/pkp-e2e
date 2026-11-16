// U14 A24: an article's landing page logs two PHP warnings per comment the visitor may see, on
// every load. Takes the steps of docs/issues/U14-A24-landing-page-logs-warnings-per-comment.md on
// PKP's default test dataset (OJS only: a press and a preprint server have no comment box).
//
//   default mode (the report's steps 1-8):
//     PROBE_FEATURE=issues-n16a PROBE_AGENT=n16a node bin/probe.js ojs shared/playwright/checks/issues/landing-page-logs-warnings-per-comment/walk.js
//   neighbour mode (the fix must not reach a full read of a comment, whose settings must still load):
//     ccorino comments on submission 17, dbarnes approves it, then opens its panel again on the
//     Comments page, whose note reads "This comment was approved on … by Daniel Barnes" from the
//     comment's two settings (approvedAt, approvedByUserId), and the article's page signed out.
//     PROBE_RUN=nb-in PROBE_FEATURE=issues-n16a PROBE_AGENT=n16a node bin/probe.js ojs …/walk.js neighbour
//
// On a line without public comments (stable-3_5_0) it records the Website settings' "Content" tab
// and the article's page signed out, and stops. Every step records rather than throws.
const {forEachApp, launch, signIn, signOut, record} = require('../../../probe');
const H = require('./lib.js');

const MODE = process.argv[2] || 'walk';
const EDITOR = 'dbarnes';
const ARTICLE = 17;
const CONTROL = 1;
const APPROVED = 'u14n16a approved comment by ccorino';
const PENDING = 'u14n16a pending comment by zzedd';

forEachApp(async (app) => {
    if (app.name !== 'ojs') {
        record('skipped', {reason: 'no comment box on a press or a preprint server (spec U14 scenario 14)'});
        return;
    }
    const ctx = app.contextPath;
    const {page, close} = await launch(app);
    const out = {mode: MODE, line: app.line || 'main'};
    const step = async (name, fn) => {
        try {
            out[name] = await fn();
        } catch (e) {
            out[name] = {error: String(e && e.message || e).slice(0, 600)};
        }
        record(MODE, out);
        return out[name];
    };
    try {
        await signIn(page, EDITOR, {contextPath: ctx});
        const tab = await step('s2-content-tab', () => H.hasCommentsTab(page, ctx));
        if (!tab || !tab.commentsSideTab) {
            await signOut(page);
            await step('no-comments-article', () => H.loadArticle(page, app, ctx, ARTICLE));
            return;
        }
        await step('s2-enable', () => H.logged(app, () => H.enableComments(page, ctx)));

        // 3-4: ccorino's comment, approved by dbarnes
        await signIn(page, 'ccorino');
        await step('s3-ccorino-comment', () => H.logged(app, () => H.writeComment(page, ctx, ARTICLE, APPROVED)));
        await signIn(page, EDITOR, {contextPath: ctx});
        await step('s4-approve', () => H.logged(app, () => H.approve(page, ctx, APPROVED)));

        if (MODE === 'neighbour') {
            await step('n-panel-note', () => H.logged(app, () => H.approvalNote(page, ctx, APPROVED)));
            await signOut(page);
            await step('n-article-signed-out', () => H.loadArticle(page, app, ctx, ARTICLE));
            return;
        }

        // 5: zzedd's pending comment
        await signIn(page, 'zzedd');
        await step('s5-zzedd-comment', () => H.logged(app, () => H.writeComment(page, ctx, ARTICLE, PENDING)));
        // 6-8: the loads
        await step('s6-zzedd-reload', () => H.loadArticle(page, app, ctx, ARTICLE));
        await signOut(page);
        await step('s7-signed-out', () => H.loadArticle(page, app, ctx, ARTICLE));
        await step('s8-control-no-comment', () => H.loadArticle(page, app, ctx, CONTROL));
    } finally {
        record(MODE, out);
        await close();
    }
});
