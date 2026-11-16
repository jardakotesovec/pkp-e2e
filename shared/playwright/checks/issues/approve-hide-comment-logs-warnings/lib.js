// Helpers of walk.js (U14 A25). Requiring this file runs nothing. Every helper drives the screens through
// the OJS U14 suite's page objects (required inside the call, once withApp has set the app); the Comments
// page and the Website settings are pkp-lib's and the same in the three apps. enableComments and
// writeComment are copied from ../deleted-comment-tasks-stay-blank/lib.js.
const {idle, screen, signIn, apiAs} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 400) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const PAGES = '../../../../../apps/ojs/playwright/pages';
const po = () => require(`${PAGES}/ReaderCommentsPages.js`);

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

/** OJS: the reader writes `text` in the article's comment box and presses "Submit". Returns the comment's id. */
async function writeComment(page, ctx, submissionId, text) {
    const {ArticleCommentsPage} = po();
    const landing = new ArticleCommentsPage(page, ctx);
    await landing.goto(submissionId);
    return await landing.writeComment(text);
}

/**
 * OMP and OPS: no screen writes a comment, so the reader, on the back-office page they land on after
 * signing in, sends the request OJS's comment box sends (POST api/v1/comments {publicationId, commentText}),
 * as the report's console snippet does. Returns {status, id}.
 */
async function writeCommentByRequest(page, publicationId, text) {
    await idle(page);
    const res = await apiAs(page, 'POST', '/comments', {publicationId, commentText: text});
    let body = null;
    try { body = await res.json(); } catch (e) { body = flat(await res.text()); }
    return {page: page.url().replace(/^https?:\/\/[^/]+/, ''), status: res.status(), id: body && body.id, body: body && body.id ? undefined : body};
}

/** Content › Comments, its heading and table settled. */
async function openCommentsPage(page, ctx) {
    const {CommentsPage} = po();
    const comments = new CommentsPage(page, ctx);
    await comments.goto();
    await idle(page);
    return comments;
}

/** On the open Comments page: the row's "…" › "View Comment"; returns the panel's note and its text. */
async function viewComment(page, comments, text) {
    await comments.viewComment(comments.row(text));
    await idle(page);
    const note = comments.note();
    return {
        note: (await note.count()) ? flat(await note.first().innerText()) : null,
        approve: await comments.approveButton().count(),
        hide: await comments.hideButton().count(),
    };
}

/**
 * Press "Approve Comment" or "Hide Comment" in the open panel and read what follows: the setApproval
 * request and its answer, the notice, whether the panel closed. Records rather than throws.
 */
async function press(page, comments, buttonName) {
    const button = buttonName === 'Approve Comment' ? comments.approveButton() : comments.hideButton();
    const out = {button: buttonName, offered: await button.count()};
    if (!out.offered) return out;
    const written = page.waitForResponse((r) => r.url().includes('/setApproval') && r.request().method() !== 'GET', {timeout: T})
        .catch(() => null);
    await button.click();
    const res = await written;
    out.request = res ? `${res.request().method()} ${new URL(res.url()).pathname}` : null;
    out.status = res ? res.status() : null;
    if (res) {
        try {
            const j = await res.json();
            out.answer = {isApproved: j.isApproved, approvedAt: j.approvedAt, approvedByUserName: j.approvedByUserName};
        } catch (e) { out.answer = null; }
    }
    out.notice = await comments.notice('The comment has been updated successfully.').waitFor({timeout: 10_000})
        .then(() => 'The comment has been updated successfully.').catch(() => null);
    await comments.commentPanel().waitFor({state: 'detached', timeout: 10_000}).catch(() => {});
    out.panelOpen = await comments.commentPanel().count();
    await idle(page);
    return out;
}

/** Which of the page's four tabs list a row holding `text`. */
async function tabsListing(page, comments, text) {
    const out = {};
    for (const tab of ['Approved', 'Hidden/Needs Approval']) {
        await comments.openTab(tab);
        out[tab] = await comments.row(text).count();
    }
    await comments.openTab('All');
    return out;
}

/**
 * The comment as the Comments page's own list request returns it (GET api/v1/comments, the request the
 * page sends on load), sent again on the open page in the moderator's session: its approval fields.
 */
async function listedComment(page, id) {
    const res = await apiAs(page, 'GET', '/comments?offset=0&count=25&page=1&perPage=25');
    let j = null;
    try { j = await res.json(); } catch (e) { return {status: res.status()}; }
    const c = (j.data || j.items || []).find((x) => x.id === id);
    return {status: res.status(), approvedAt: c ? c.approvedAt : undefined, approvedByUserName: c ? c.approvedByUserName : undefined, isApproved: c ? c.isApproved : undefined};
}

module.exports = {
    T, flat, po, signIn, screen, enableComments, writeComment, writeCommentByRequest, openCommentsPage,
    viewComment, press, tabsListing, listedComment,
};
