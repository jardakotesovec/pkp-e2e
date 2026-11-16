// Helpers of walk.js (U14 A24). Requiring this file runs nothing. Every helper drives the screens,
// through the OJS U14 suite's page objects (required inside the call, once withApp has set the app).
// enableComments, writeComment and approve are copied from deleted-comment-tasks-stay-blank/lib.js.
const {idle, screen, serverLog} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 400) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const PAGES = '../../../../../apps/ojs/playwright/pages';
const po = () => require(`${PAGES}/ReaderCommentsPages.js`);

/** Settings › Website › "Content": is there a "Comments" side tab? (3.5 has no public comments.) */
async function hasCommentsTab(page, ctx) {
    const {CommentsSettingsTab} = po();
    const tab = new CommentsSettingsTab(page, ctx);
    await page.goto(tab.url());
    await tab.contentTab().waitFor({timeout: T});
    await tab.contentTab().click();
    await idle(page);
    return {commentsSideTab: await tab.commentsSideTab().count(), screen: await screen(page)};
}

/** Settings › Website › Content › Comments: tick "Enable Public Comments", "Save". */
async function enableComments(page, ctx) {
    const {CommentsSettingsTab} = po();
    const tab = new CommentsSettingsTab(page, ctx);
    await tab.goto();
    const was = await tab.box().isChecked();
    if (!was) await tab.box().check();
    await tab.save();
    await tab.openCommentsTab();
    return {was, now: await tab.box().isChecked()};
}

/** The reader writes `text` in the article's comment box and presses "Submit". Returns the comment's id. */
async function writeComment(page, ctx, submissionId, text) {
    const {ArticleCommentsPage} = po();
    const landing = new ArticleCommentsPage(page, ctx);
    await landing.goto(submissionId);
    return await landing.writeComment(text);
}

/** Content › Comments: the row's "…" › "View Comment" › "Approve Comment". */
async function approve(page, ctx, text) {
    const {CommentsPage} = po();
    const comments = new CommentsPage(page, ctx);
    await comments.goto();
    await comments.viewComment(comments.row(text));
    await comments.setApproval('Approve Comment');
}

/** Content › Comments: the row's "…" › "View Comment"; the panel's note on the right. */
async function approvalNote(page, ctx, text) {
    const {CommentsPage} = po();
    const comments = new CommentsPage(page, ctx);
    await comments.goto();
    await comments.viewComment(comments.row(text));
    const note = comments.note();
    await note.waitFor({timeout: T}).catch(() => {});
    return {note: (await note.count()) ? flat(await note.innerText()) : null, screen: await screen(page)};
}

/**
 * Open (or reload) the article's page and read it: the response status, the sidebar's
 * "All Comments (n)", the version headings, the comments shown, and the server-log lines
 * (warnings, errors) the load wrote, from its request to the page's own fetches settling.
 */
async function loadArticle(page, app, ctx, submissionId) {
    const {ArticleCommentsPage} = po();
    const landing = new ArticleCommentsPage(page, ctx);
    const log = serverLog(app);
    const from = log.mark();
    const response = await page.goto(landing.url(submissionId));
    await page.locator('h1').first().waitFor({timeout: T});
    await idle(page);
    const block = await landing.mainBlock().count();
    if (block) await landing.comments().first().waitFor({timeout: 10_000}).catch(() => {});
    const all = landing.allCommentsLink();
    const out = {
        url: page.url().replace(/^https?:\/\/[^/]+/, ''),
        status: response ? response.status() : null,
        commentsBlock: block,
        allComments: (await all.count()) ? flat(await all.innerText()) : null,
        parts: block ? await landing.partLabels() : [],
        shown: block ? (await landing.comments().allInnerTexts()).map((t) => flat(t, 160)) : [],
        html: {warningText: /Undefined property|Warning:/.test(await page.content())},
    };
    await page.waitForTimeout(500); // the log file is written by the server process; let it flush
    out.log = log.since(from);
    out.userCommentIdWarnings = out.log.filter((l) => /\$user_comment_id/.test(l)).length;
    out.byLine = out.log.reduce((acc, l) => {
        const m = l.match(/on line (\d+)/);
        if (m) acc[m[1]] = (acc[m[1]] || 0) + 1;
        return acc;
    }, {});
    out.screen = await screen(page);
    return out;
}

/** The log lines (warnings, errors) written while `fn` runs. */
async function logged(app, fn) {
    const log = serverLog(app);
    const from = log.mark();
    const result = await fn();
    await new Promise((r) => setTimeout(r, 500));
    return {result, log: log.since(from)};
}

module.exports = {T, flat, po, hasCommentsTab, enableComments, writeComment, approve, approvalNote, loadArticle, logged};
