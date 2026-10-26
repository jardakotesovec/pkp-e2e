// Helpers of walk.js (U14 A14). Requiring this file runs nothing. Every helper drives the screens,
// through the OJS U14 suite's page objects (required inside the call, once withApp has set the app).
const {idle} = require('../../../probe');

const PAGES = '../../../../../apps/ojs/playwright/pages';
const po = () => require(`${PAGES}/ReaderCommentsPages.js`);
const flat = (s, n = 400) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

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

/** Open the article's page, type `text` in the comment box, "Submit". Returns the comment's id. */
async function writeComment(page, ctx, submissionId, text) {
    const {ArticleCommentsPage} = po();
    const landing = new ArticleCommentsPage(page, ctx);
    await landing.goto(submissionId);
    await idle(page);
    return landing.writeComment(text);
}

/** Content › Comments: the row's "…" › "View Comment" › `button` ("Approve Comment" | "Hide Comment"). */
async function moderate(page, ctx, text, button) {
    const {CommentsPage} = po();
    const comments = new CommentsPage(page, ctx);
    await comments.goto();
    await comments.viewComment(comments.row(text));
    await comments.setApproval(button);
}

/** Every open dialog: its name, text and the value of its text box (the reason box). */
async function dialogs(page) {
    return page.getByRole('dialog').evaluateAll((ds) => ds.map((d) => ({
        name: d.getAttribute('aria-label') || (document.getElementById(d.getAttribute('aria-labelledby') || '') || {}).innerText || (d.querySelector('h1,h2,h3') || {}).innerText || null,
        text: d.innerText.replace(/\s+/g, ' ').trim().slice(0, 300),
        reason: d.querySelector('textarea') ? d.querySelector('textarea').value : null,
    })));
}

/**
 * Press "Submit" in the open "Report Comment" window and read what follows: the report request's
 * status and body, then (after the windows' animations) every open dialog.
 */
async function submitAndRead(page, dialog) {
    const answered = page.waitForResponse((r) => /\/reports$/.test(r.url()) && r.request().method() === 'POST', {timeout: 30_000}).catch(() => null);
    await dialog.getByRole('button', {name: 'Submit', exact: true}).click();
    const r = await answered;
    await page.waitForTimeout(2000);
    return {status: r && r.status(), body: r && flat(await r.text().catch(() => ''), 200), dialogs: await dialogs(page)};
}

module.exports = {flat, po, enableComments, writeComment, moderate, dialogs, submitAndRead};
