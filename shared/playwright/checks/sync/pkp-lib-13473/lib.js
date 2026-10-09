// Helpers of popovers.js (PR review of pkp/pkp-lib#13472: the editorial dashboard's reviewer
// popovers). Requiring this file runs nothing. Every helper drives the screens a person uses: the
// workflow's "Reviewers" panel, its row menu ("More Actions") and the windows it opens, and the
// dashboard's activity indicators with their popovers.
const {idle, screen} = require('../../../probe');
const W = require('../../issues/reviewer-own-round-listed-under-previous-reviews/lib.js');
const U = require('../../issues/unassign-notice-cancel-subject/lib.js');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const R = () => require('../../../../../apps/omp/playwright/pages/ReviewerAssignmentPages.js');

/**
 * Per app, on PKP's default test dataset (docs/process/dataset.md): a submission in Review round 1
 * with two reviewers who have not answered.
 */
const CASES = {
    ojs: {id: 12, a: {user: 'jjanssen', name: 'Julie Janssen'}, b: {user: 'phudson', name: 'Paul Hudson'}},
    omp: {id: 2, a: {user: 'alzacharia', name: 'Al Zacharia'}, b: {user: 'gfavio', name: 'Gonzalo Favio'}},
};

/** Today plus n days, the machine's local time, noon. */
function day(n) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return d;
}

/** Open the submission's workflow as the signed-in editor (it opens on Review, Round 1). */
async function openWorkflow(page, app, id) {
    const modal = await W.openWorkflow(page, app, id);
    await modal.locator('[data-cy="reviewer-manager"]').waitFor({timeout: T});
    await idle(page);
    return modal;
}

/** The reviewer's row in the Reviewers panel as it reads. */
async function panelRow(modal, name) {
    const row = R().reviewerRow(modal, name).first();
    await row.waitFor({timeout: T});
    return flat(await row.innerText(), 300);
}

/** "More Actions" > "Log Response" on the row, the response chosen by its label, "Log Response". */
async function logResponse(page, modal, name, option) {
    const menu = await U.rowAction(page, name, 'Log Response');
    const box = page.getByRole('dialog').filter({hasText: 'Record the response on behalf of the reviewer'});
    await box.waitFor({timeout: T});
    await box.getByRole('radio', {name: option}).check();
    await box.getByRole('button', {name: 'Log Response', exact: true}).click();
    await box.waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
    await sleep(600);
    return {menu: menu.entries, row: await panelRow(modal, name)};
}

/** "More Actions" > "Edit": pick both due dates from the calendars, "OK". */
async function editDates(page, modal, name, response, review) {
    const P = R();
    const win = await P.openEditReview(page, P.reviewerRow(modal, name).first());
    await P.pickDate(page, win, 'responseDueDate', response);
    await P.pickDate(page, win, 'reviewDueDate', review);
    await P.saveEditReview(win);
    await idle(page);
    await sleep(600);
    return {responseDueDate: P.isoDate(response), reviewDueDate: P.isoDate(review), row: await panelRow(modal, name)};
}

/** "More Actions" > "Cancel Reviewer", the window sent as it comes. */
async function cancelReviewer(page, modal, name) {
    const menu = await U.rowAction(page, name, 'Cancel Reviewer');
    await page.locator('form#cancelReviewForm, form#unassignReviewerForm').first().waitFor({timeout: T});
    const formId = (await page.locator('form#cancelReviewForm').count()) ? 'cancelReviewForm' : 'unassignReviewerForm';
    const notices = await U.submitWindow(page, formId, 'Cancel Reviewer');
    return {menu: menu.entries, notices, row: await panelRow(modal, name)};
}

/** The dashboard's "Active submissions" view and the submission's row on it, in the language of `locale`. */
async function dashboardRow(page, app, id, locale = 'en') {
    const {EditorialDashboardPage} = require('../../../pages/EditorialDashboardPage.js');
    const dash = new EditorialDashboardPage(page, app.contextPath);
    await page.goto('about:blank');
    await page.goto(app.url(`/index.php/${app.contextPath}/${locale}/dashboard/editorial?currentViewId=active`));
    if (locale === 'en') await dash.heading().waitFor({timeout: T});
    await idle(page);
    await page.locator('table tbody tr').first().waitFor({timeout: T});
    const index = await page.evaluate((wanted) =>
        [...document.querySelectorAll('table tbody tr')].findIndex((tr) => {
            const c = tr.querySelector('th, td');
            return c && Number(c.innerText.replace(/\D+/g, '')) === wanted;
        }), id);
    if (index < 0) return {dash, row: null};
    return {dash, row: page.locator('table tbody tr').nth(index)};
}

/**
 * The row's reviewer indicators (the buttons of its "Editorial Activity" cell that speak of a
 * review; with `all`, every button of the cell, for a language other than English).
 */
async function indicators(dash, row, all = false) {
    const buttons = dash.activityCell(row).getByRole('button');
    const out = [];
    for (let i = 0; i < await buttons.count(); i++) {
        const b = buttons.nth(i);
        const aria = flat(await b.getAttribute('aria-label').catch(() => null), 160);
        const text = flat(await b.innerText().catch(() => ''), 160);
        if (all || /review|reviewer|request|overdue|declined|cancel|awaiting|ongoing/i.test(`${aria || ''} ${text}`)) out.push({b, aria, text});
    }
    return out;
}

/**
 * Open the popover that names `name` and leave it open: {panel, read}, `read` holding the
 * indicator as it shows (its text, the ring's number among it), the popover's lines and its
 * buttons. Null when no indicator's popover names the reviewer.
 */
async function openPopover(page, dash, row, name, all = false) {
    for (const {b, aria, text} of await indicators(dash, row, all)) {
        await b.click();
        const panel = dash.activityPopover(row);
        await panel.waitFor({timeout: T});
        await sleep(300);
        const whole = await panel.innerText();
        if (whole.includes(name)) {
            const buttons = (await panel.getByRole('button').allInnerTexts()).map((t) => flat(t, 80)).filter(Boolean);
            const lines = whole.split('\n').map((l) => l.trim()).filter(Boolean);
            return {panel, read: {indicator: text, indicatorLabel: aria, lines, buttons}};
        }
        await dash.closeActivityPopover(row).catch(() => {});
        await sleep(300);
    }
    return null;
}

/** The popover of `name` on the dashboard row of the submission, read and closed. */
async function readPopover(page, app, id, name, locale = 'en') {
    const {dash, row} = await dashboardRow(page, app, id, locale);
    if (!row) return {listed: false};
    const open = await openPopover(page, dash, row, name, locale !== 'en');
    if (!open) return {listed: true, popover: null, activity: flat(await dash.activityCell(row).innerText(), 300)};
    await dash.closeActivityPopover(row).catch(() => {});
    return open.read;
}

/** The popover of `name`, opened and one of its buttons pressed. Returns what it read before the press. */
async function pressPopoverButton(page, app, id, name, label) {
    const {dash, row} = await dashboardRow(page, app, id);
    const open = await openPopover(page, dash, row, name);
    if (!open) throw new Error(`no popover names ${name}`);
    await open.panel.getByRole('button', {name: label, exact: true}).click();
    await idle(page);
    await sleep(600);
    return open.read;
}

/** The same popover read by a browser set to another time zone, signed in as the page is. */
async function readPopoverIn(browser, page, app, id, name, timezoneId) {
    const context = await browser.newContext({
        baseURL: app.baseURL, viewport: {width: 1280, height: 900}, reducedMotion: 'reduce',
        storageState: await page.context().storageState(), timezoneId,
    });
    try {
        const p = await context.newPage();
        const read = await readPopover(p, app, id, name);
        return {timezoneId, browserNow: await p.evaluate(() => new Date().toString()), ...read};
    } finally {
        await context.close();
    }
}

module.exports = {
    T, sleep, flat, CASES, day, U, W, openWorkflow, panelRow, logResponse, editDates, cancelReviewer,
    dashboardRow, openPopover, readPopover, pressPopoverButton, readPopoverIn, screen,
};
