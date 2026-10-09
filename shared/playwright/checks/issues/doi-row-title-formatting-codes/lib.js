// Helpers of walk.js (issue report docs/issues/U45-A24-doi-row-title-formatting-codes.md).
// Requiring this file runs nothing. The italic title of the Steps is retyped by
// ../articles-report-title-html-codes/lib.js `retypeTitle`; this adds a plain retype of the
// form's three title boxes for the `chars` mode.
const {idle} = require('../../../probe');
const {workflowFrame} = require('../older-version-tab-current-title/lib');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BOX = {
    prefix: 'titleAbstract-prefix-control-en',
    title: 'titleAbstract-title-control-en',
    subtitle: 'titleAbstract-subtitle-control-en',
};

/**
 * Open a submission's workflow on Publication › "Title & Abstract" and type into the boxes
 * named in `values` ("Prefix", a plain text box; "Title" and "Subtitle", one-line rich-text
 * boxes) as a person does with the keyboard: select all, type; no formatting. Then "Save".
 * Returns what each box held before and after, the save's status and what it stored.
 */
async function retypeTitleBoxes(page, app, submissionId, values) {
    const frame = workflowFrame(page, app);
    await frame.gotoEditorial(submissionId);
    await idle(page);
    const entry = app.line === 'stable-3_5_0'
        ? frame.menuLink('Title & Abstract').last()
        : await frame.revealPublicationEntry('Title & Abstract');
    await entry.click();
    await idle(page);
    await page.waitForFunction((id) => !!window.tinymce?.get(id)?.initialized, BOX.title, {timeout: T});
    const out = {before: {}, after: {}};
    for (const [name, text] of Object.entries(values)) {
        if (name === 'prefix') {
            const box = page.locator(`[id="${BOX.prefix}"]`);
            out.before.prefix = await box.inputValue();
            await box.click();
            await page.keyboard.press('Control+A');
            await page.keyboard.type(text, {delay: 80});
            out.after.prefix = await box.inputValue();
            continue;
        }
        await page.waitForFunction((id) => !!window.tinymce?.get(id)?.initialized, BOX[name], {timeout: T});
        out.before[name] = await page.evaluate((id) => window.tinymce.get(id).getContent(), BOX[name]);
        await page.evaluate((id) => window.tinymce.get(id).focus(), BOX[name]);
        await page.keyboard.press('Control+A');
        await page.keyboard.type(text, {delay: 80});
        await sleep(800);
        out.after[name] = await page.evaluate((id) => window.tinymce.get(id).getContent(), BOX[name]);
    }
    const saved = page
        .waitForResponse((r) => /\/submissions\/\d+\/publications\/\d+$/.test(new URL(r.url()).pathname) && r.request().method() !== 'GET', {timeout: T})
        .catch(() => null);
    await page.locator('[data-cy="workflow-primary-items"]').getByRole('button', {name: 'Save', exact: true}).click();
    const r = await saved;
    out.shown = await page.locator('.pkpFormPage__status', {hasText: 'Saved'}).waitFor({state: 'visible', timeout: T}).then(() => 'Saved').catch(() => null);
    await idle(page);
    out.save = r ? r.status() : null;
    if (r) {
        const body = await r.json().catch(() => null);
        out.stored = body && {prefix: body.prefix?.en, title: body.title?.en, subtitle: body.subtitle?.en, fullTitle: body.fullTitle?.en};
    }
    return out;
}

module.exports = {retypeTitleBoxes};
