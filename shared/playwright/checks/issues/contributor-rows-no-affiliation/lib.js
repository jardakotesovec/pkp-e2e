// Helpers of walk.js (U41 A1, the contributor rows). Requiring this file runs nothing. Every helper
// reads or drives the screens. openWorkflowContributors and continueToContributors are copied from
// one-role-journal-contributor-save-fails/lib.js, beginSubmission, currentStep and pressContinue from
// wizard-refused-save-hangs-saving/lib.js, so this folder stands alone.
const {idle} = require('../../../probe');
const {waitForEditorReady} = require('../../../support/richtext.js');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

/** Each row of the open "Contributors" list: its title and the line under it (null when the row has no such line). */
async function rowLines(page) {
    return page.locator('.listPanel--contributor li.listPanel__item').evaluateAll((items) => items.map((li) => {
        const title = li.querySelector('.listPanel__itemTitle');
        const sub = li.querySelector('.listPanel__itemSubtitle');
        return {
            title: title ? title.innerText.replace(/\s+/g, ' ').trim() : null,
            subtitle: sub ? sub.innerText.replace(/\s+/g, ' ').trim() : null,
            subtitleShown: !!sub && sub.getClientRects().length > 0,
        };
    }));
}

/** Press "Edit" on the row of `name`, read the window's "Affiliations" field, close it with its own "Close". */
async function editAffiliations(page, name) {
    await page.locator('.listPanel--contributor li.listPanel__item').filter({hasText: name}).first()
        .getByRole('button', {name: 'Edit', exact: true}).click();
    const d = page.getByRole('dialog', {name: /^Edit$/}).last();
    await d.waitFor({timeout: T});
    await d.getByRole('button', {name: 'Save', exact: true}).waitFor({timeout: T});
    await idle(page).catch(() => {});
    await sleep(500);
    const field = d.locator('.pkpFormField--affiliations').first();
    const affiliations = (await field.count()) ? flat(await field.innerText(), 400) : null;
    await d.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
    await d.waitFor({state: 'hidden', timeout: 6000}).catch(() => {});
    await sleep(600);
    return affiliations;
}

/**
 * Press "Edit" on the row of `name`, type `institution` under "Affiliations", choose the typed text,
 * "Add", "Save"; returns the save's status and the window's state; the window is closed.
 */
async function addAffiliation(page, name, institution) {
    await page.locator('.listPanel--contributor li.listPanel__item').filter({hasText: name}).first()
        .getByRole('button', {name: 'Edit', exact: true}).click();
    const d = page.getByRole('dialog', {name: /^Edit$/}).last();
    await d.waitFor({timeout: T});
    await d.getByRole('button', {name: 'Save', exact: true}).waitFor({timeout: T});
    await idle(page).catch(() => {});
    const field = d.locator('#contributor-affiliations');
    const search = field.locator('input.pkpAutosuggest__input');
    await search.click();
    await search.pressSequentially(institution, {delay: 15});
    await field.locator('li.autosuggest__results-item').filter({hasText: institution}).first().click({timeout: T});
    await field.getByRole('button', {name: 'Add', exact: true}).click();
    await sleep(500);
    const listed = flat(await field.innerText(), 400);
    const resp = page.waitForResponse((x) => /\/contributors\/\d+/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await d.getByRole('button', {name: 'Save', exact: true}).click();
    const res = await resp;
    await idle(page).catch(() => {});
    await sleep(1000);
    if (await d.isVisible().catch(() => false)) {
        await d.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await d.waitFor({state: 'hidden', timeout: 6000}).catch(() => {});
    }
    await sleep(600);
    return {listed, status: res ? res.status() : null};
}

/** The wizard's "Review" step: the names its "Contributors" section lists. */
async function reviewContributorNames(page) {
    return (await page.locator('.submissionWizard__reviewPanel__list__name').allInnerTexts()).map((x) => flat(x, 200));
}

/** The wizard's "Review" step: each "Contributors" row whole, the name and the badges after it. */
async function reviewContributorRows(page) {
    return (await page.locator('li.submissionWizard__reviewPanel__item__value')
        .filter({has: page.locator('.submissionWizard__reviewPanel__list__name')}).allInnerTexts()).map((x) => flat(x, 300));
}

const contributorPanel = (page) => page.locator('.listPanel--contributor').first();

/** The workflow's Publication › "Contributors" of submission `subId`, publication `pubId`. */
async function openWorkflowContributors(page, app, subId, pubId) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${subId}&workflowMenuKey=publication_${pubId}_contributors`));
    await idle(page).catch(() => {});
    const panel = contributorPanel(page);
    await panel.waitFor({timeout: 15_000}).catch(() => {});
    if (!(await panel.isVisible().catch(() => false))) {
        const link = page.locator('[role="dialog"]:visible').first().getByRole('link', {name: 'Contributors', exact: true});
        if (await link.count()) { await link.last().click(); await idle(page).catch(() => {}); }
        await panel.waitFor({timeout: T});
    }
    await idle(page).catch(() => {});
    await sleep(500);
}

/** The wizard: "Continue" until the "Contributors" list shows. */
async function continueToContributors(page) {
    for (let i = 0; i < 5 && !(await contributorPanel(page).isVisible().catch(() => false)); i++) {
        const cont = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true});
        if (!(await cont.count())) break;
        await cont.first().click();
        await idle(page).catch(() => {});
        await sleep(800);
    }
    await contributorPanel(page).waitFor({timeout: T});
    await idle(page).catch(() => {});
}

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

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const current = (page) => page.locator('.pkpSteps__step__label--current');
async function currentStep(page) { return flat(await current(page).innerText().catch(() => ''), 80); }

/** Press the footer's "Continue" and wait until the next rail step is current. */
async function pressContinue(page) {
    const labels = (await page.locator('.pkpSteps__step__label').allInnerTexts()).map((x) => flat(x));
    const c = await currentStep(page);
    const k = labels.findIndex((l) => l === c);
    const next = k >= 0 && labels[k + 1] ? labels[k + 1].replace(/^\d+\s*/, '') : null;
    await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true}).click({timeout: 10_000});
    if (next) await current(page).filter({hasText: new RegExp(`${esc(next)}\\s*$`)}).waitFor({timeout: 10_000}).catch(() => {});
    return next;
}

module.exports = {T, sleep, flat, rowLines, editAffiliations, addAffiliation, reviewContributorNames, reviewContributorRows,
    openWorkflowContributors, continueToContributors, beginSubmission, currentStep, pressContinue};
