// Helpers for walk.js (U21 A24). Requiring this file runs nothing.
// typeRich, beginSubmission, pressContinue copied from checks/issues/wizard-refused-save-hangs-saving/lib.js (U21 A19).
const {idle} = require('../../../probe');
const {waitForEditorReady} = require('../../../support/richtext.js');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const endAnchored = (name) => new RegExp(`${esc(name)}\\s*$`);
const localeSeg = (app) => (app.line && /3_[34]/.test(app.line) ? '' : '/en');

/** Type into a rich-text box by its control id (replacing what it holds). */
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
    await page.goto(app.url(`/index.php/${app.contextPath}${localeSeg(app)}/submission`));
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
    await current(page).waitFor({timeout: T});
    await idle(page);
    return Number(new URL(page.url()).searchParams.get('id'));
}

const footer = (page) => page.locator('.submissionWizard__footer');
const current = (page) => page.locator('.pkpSteps__step__label--current');
async function currentStep(page) { return flat(await current(page).innerText().catch(() => ''), 80); }

/** Press the footer's "Continue" and wait until the next rail step is current. */
async function pressContinue(page) {
    const labels = (await page.locator('.pkpSteps__step__label').allInnerTexts()).map((x) => flat(x));
    const c = await currentStep(page);
    const k = labels.findIndex((l) => l === c);
    const next = k >= 0 && labels[k + 1] ? labels[k + 1].replace(/^\d+\s*/, '') : null;
    await footer(page).getByRole('button', {name: 'Continue', exact: true}).click({timeout: 10_000});
    if (next) await current(page).filter({hasText: endAnchored(next)}).waitFor({timeout: 10_000}).catch(() => {});
    await idle(page);
    return next;
}

/** The step rail as data: each entry's label, whether it is a button (reached) and whether it is current. */
async function readRail(page) {
    await current(page).waitFor({timeout: T}).catch(() => {});
    return page.locator('.pkpSteps__step__label').evaluateAll((els) => els.map((e) => ({
        label: e.textContent.replace(/\s+/g, ' ').trim(),
        reached: e.tagName === 'BUTTON',
        current: e.classList.contains('pkpSteps__step__label--current'),
    })));
}

/** The wizard as the author sees it: the open step, the address's "#…" part, the rail, the tab title. */
async function readWizard(page) {
    await idle(page);
    const rail = await readRail(page);
    return {
        currentStep: (rail.find((r) => r.current) || {}).label || null,
        hash: await page.evaluate(() => window.location.hash),
        title: await page.title(),
        rail,
        unreached: rail.filter((r) => !r.reached).map((r) => r.label),
    };
}

/**
 * Press the footer's "Save for Later" and wait for the "Saved for Later" screen.
 * Returns the `step` the saveForLater request carried and its status.
 */
async function saveForLater(page) {
    const req = page.waitForRequest((r) => /\/saveForLater/.test(r.url()), {timeout: T});
    const resp = page.waitForResponse((r) => /\/saveForLater/.test(r.url()), {timeout: 45_000});
    await footer(page).getByRole('button', {name: 'Save for Later', exact: true}).click({timeout: 10_000});
    const r = await req;
    const res = await resp;
    await page.getByRole('heading', {name: 'Saved for Later'}).waitFor({timeout: 45_000}).catch(() => {});
    await idle(page);
    const body = r.postData() || '';
    return {sent: flat(body, 200), step: new URLSearchParams(body).get('step'), status: res.status()};
}

/** "My Submissions", the row naming the title, "Complete submission". Returns the address the press opened. */
async function completeSubmission(page, app, title) {
    await page.goto(app.url(`/index.php/${app.contextPath}${localeSeg(app)}/dashboard/mySubmissions`));
    await idle(page);
    const row = page.getByRole('row').filter({hasText: title});
    await row.first().waitFor({timeout: T});
    const rowText = flat(await row.first().innerText(), 200);
    await row.first().getByRole('button', {name: 'Complete submission', exact: true}).click({timeout: 10_000});
    await page.waitForURL(/\/submission\?id=\d+/, {timeout: T});
    await current(page).waitFor({timeout: T});
    await idle(page);
    return {rowText, url: page.url().replace(/^https?:\/\/[^/]+/, '')};
}

module.exports = {T, flat, endAnchored, localeSeg, typeRich, beginSubmission, footer, current, currentStep, pressContinue, readRail, readWizard, saveForLater, completeSubmission};
