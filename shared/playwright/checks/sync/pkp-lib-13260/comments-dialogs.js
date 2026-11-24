// PR review of pkp/pkp-lib#13242, round 2: the Default theme's comment menu
// and its two dialogs (Report, Delete) with the original comment components
// restored and the shared UserComment.po texts reworded (some keys defined
// twice). OJS, PKP's default dataset, Default theme; needs one approved
// comment by dbarnes on article 1 (shots.js leaves one).
// Run: PROBE_FEATURE=pr13242 PROBE_AGENT=dialogs node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13260/comments-dialogs.js
const {forEachApp, launch, signIn, shot, record, sql} = require('../../../probe');

const J = '/index.php/publicknowledge/en';
const flat = (t, n = 400) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

async function dialogOf(page, item) {
    const article = page.locator('#public-comments article').first();
    await article.scrollIntoViewIfNeeded();
    await article.getByRole('button').click();
    await page.getByRole('menuitem').first().waitFor({timeout: 20_000});
    const items = (await page.getByRole('menuitem').allInnerTexts()).map((t) => t.trim());
    await page.getByRole('menuitem').filter({hasText: item}).first().click();
    const dialog = page.getByRole('dialog').first();
    await dialog.waitFor({timeout: 20_000});
    return {items, dialog};
}

forEachApp(async (app) => {
    const out = {};
    out.enable = sql(app, "update journal_settings set setting_value = '1' where setting_name = 'enablePublicComments'");
    out.approve = sql(app, 'update user_comments set is_approved = true');
    out.rows = sql(app, 'select user_comment_id, user_id, is_approved, left(comment_text, 50) from user_comments order by 1');
    const reader = await launch(app);
    const writer = await launch(app);
    try {
        // Another signed-in user reports dbarnes's comment.
        await signIn(reader.page, 'rvaca', {contextPath: 'publicknowledge'});
        await reader.page.goto(`${J}/article/view/1`, {waitUntil: 'load'});
        const r = await dialogOf(reader.page, /^Report$/);
        out.readerMenu = r.items;
        out.reportDialog = {
            name: await r.dialog.getAttribute('aria-labelledby').then((id) => (id ? reader.page.locator(`#${id}`).innerText() : null)).catch(() => null),
            text: flat(await r.dialog.innerText()),
            html: flat(await r.dialog.innerHTML(), 1500).match(/\{\$[a-zA-Z]+\}|&lt;strong&gt;/g),
        };
        await r.dialog.screenshot({path: (await shot(reader.page, 'report-page')).replace('report-page', 'report-dialog')});
        await reader.page.keyboard.press('Escape');

        // The writer deletes their own comment (opened only, not confirmed).
        await signIn(writer.page, 'dbarnes', {contextPath: 'publicknowledge'});
        await writer.page.goto(`${J}/article/view/1`, {waitUntil: 'load'});
        const d = await dialogOf(writer.page, /^Delete/);
        out.writerMenu = d.items;
        out.deleteDialog = {text: flat(await d.dialog.innerText())};
        await d.dialog.screenshot({path: (await shot(writer.page, 'delete-page')).replace('delete-page', 'delete-dialog')});
    } catch (e) {
        out.error = flat(e.message, 300);
    } finally {
        record('comments-dialogs', out);
        await reader.close();
        await writer.close();
    }
});
