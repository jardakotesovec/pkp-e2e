// Helpers of walk.js here (issue report docs/issues/U37-A15-add-window-template-search-french-email-template.md).
// Requiring this file runs nothing. Every helper drives the screens a person uses, on PKP's default test dataset.
const {idle} = require('../../../probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** Per app: the dataset's submission in Production, and a decision of that stage whose page has an email composer. */
const SUBMISSION = {ojs: 5, omp: 4, ops: 1};
const MENU_KEY = 'workflow_5';
const DECISION = {ojs: 29, omp: 29, ops: 8}; // "Back To Copyediting"; a preprint server: "Decline Submission"

/** A search box as the eye and a screen reader get it: its placeholder and its accessible name. */
async function readSearch(box) {
    await box.waitFor({state: 'visible', timeout: 30_000});
    return {
        placeholder: await box.getAttribute('placeholder'),
        name: flat(await box.evaluate((el) => (el.closest('label') ? el.closest('label').innerText : ''))),
    };
}

/**
 * In the interface language `locale`: the submission's workflow at Production, the Tasks & Discussions panel's
 * add button (the one in its header), and the window that opens. Returns the panel's heading, the button's text
 * and the window (the dialog holding the "Name" box).
 */
async function openAddWindow(page, app, locale) {
    await page.goto(app.url(`/index.php/${app.contextPath}/${locale}/dashboard/editorial?workflowSubmissionId=${SUBMISSION[app.name]}&workflowMenuKey=${MENU_KEY}`));
    const panel = page.locator('[data-cy="discussion-manager"]').first();
    await panel.waitFor({state: 'visible', timeout: 30_000});
    await idle(page);
    const add = panel.locator('button').first();
    const heading = flat(await panel.locator('h3').first().innerText());
    const addText = flat(await add.innerText());
    await add.click();
    const win = page.getByRole('dialog').filter({has: page.locator('input[name="title"]')}).last();
    await win.locator('input[type="search"]').waitFor({state: 'visible', timeout: 30_000});
    await idle(page);
    await sleep(800);
    return {heading, addText, win};
}

/** The window's template buttons, each as its first line ("{TYPE} - {name}"; the uppercase is CSS). */
async function templateNames(win) {
    const buttons = win.locator('ul[role="list"] button');
    return (await buttons.evaluateAll((els) => els.map((el) => (el.querySelector('div') || el).textContent))).map((s) => flat(s));
}

/** Type `phrase` into the window's template search and press Enter; the editTaskTemplates answers and the list. */
async function searchTemplates(page, win, phrase) {
    const calls = [];
    const on = (r) => {
        if (/\/api\/v1\/editTaskTemplates\?/.test(r.url())) calls.push({status: r.status(), query: new URL(r.url()).search});
    };
    page.on('response', on);
    const box = win.locator('input[type="search"]');
    await box.fill(phrase);
    await box.press('Enter');
    await page.waitForResponse((r) => /\/api\/v1\/editTaskTemplates\?/.test(r.url()), {timeout: 10_000}).catch(() => null);
    await idle(page);
    await sleep(800);
    page.off('response', on);
    return {phrase, calls, list: await templateNames(win)};
}

/** A decision page's email composer in the interface language `locale`: its template heading and search box. */
async function openComposer(page, app, locale) {
    await page.goto(app.url(`/index.php/${app.contextPath}/${locale}/decision/record/${SUBMISSION[app.name]}?decision=${DECISION[app.name]}`));
    await idle(page);
    const box = page.locator('.composer__templates__search input[type="search"]').first();
    await box.waitFor({state: 'visible', timeout: 30_000});
    return {
        title: flat(await page.locator('h1').first().innerText().catch(() => null), 200),
        heading: flat(await page.locator('.composer__templates__heading').first().innerText()),
        box,
    };
}

module.exports = {sleep, flat, SUBMISSION, MENU_KEY, DECISION, readSearch, openAddWindow, templateNames, searchTemplates, openComposer};
