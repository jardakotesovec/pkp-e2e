// Helpers for walk.js (U24 OPS3). Requiring this file runs nothing.
// Copied from checks/issues/wizard-refused-save-hangs-saving/lib.js (U21 A19).
const {idle} = require('../../../probe');
const {waitForEditorReady} = require('../../../support/richtext.js');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** Type into a rich-text box of the wizard by its control id (replacing what it holds). */
async function typeRich(page, id, text) {
    await page.locator(`#${id}_ifr`).waitFor({state: 'visible', timeout: T});
    await waitForEditorReady(page, id);
    await page.frameLocator(`#${id}_ifr`).locator('body').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(text);
}

/** "Make a Submission": title, the section / language when offered, the boxes, "Begin Submission". Returns the id. */
async function beginSubmission(page, app, {title, section}) {
    await page.goto(app.url(`/index.php/${app.contextPath}${app.line && /3_[34]/.test(app.line) ? '' : '/en'}/submission`));
    await page.getByRole('heading', {name: /Make a Submission/}).first().waitFor({timeout: T});
    await typeRich(page, 'startSubmission-title-control', title);
    if (section) {
        const r = page.getByRole('radio', {name: section, exact: true});
        if (await r.count()) await r.check();
    }
    const en = page.getByRole('radio', {name: 'English', exact: true});
    if (await en.count()) await en.check();
    for (const name of [/meets all of these requirements/, /agree to have my data collected/]) {
        const b = page.getByRole('checkbox', {name});
        if (await b.count()) await b.check();
    }
    await page.getByRole('button', {name: 'Begin Submission'}).click();
    await page.waitForURL(/[?&]id=\d+/, {waitUntil: 'commit', timeout: 45_000});
    await page.locator('.pkpSteps__step__label--current').waitFor({timeout: T});
    await idle(page);
    return Number(new URL(page.url()).searchParams.get('id'));
}

module.exports = {T, flat, typeRich, beginSubmission};
