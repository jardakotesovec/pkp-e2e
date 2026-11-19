// Helpers for walk.js (U27 A54). Requiring this file runs nothing.
const {idle, axExposure} = require('../../../probe');

const T = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** The submission each app's steps use, from the default dataset. */
const SUBMISSION = {
    ojs: {id: 12, title: 'Sodium butyrate improves growth performance', view: null},
    omp: {id: 17, title: 'Open Development: Networked Innovations', view: 'active'},
};

/** The legacy "Edit Review" window and the "Add Reviewer" window. */
const editWin = (page) => page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')}).last();
const addWin = (page) => page.getByRole('dialog').filter({has: page.locator('.listPanel--selectReviewer')}).last();
const picker = (page) => page.locator('#ui-datepicker-div');

/** The page's calendar and the body-level TinyMCE layer as the DOM holds them (attributes, parent). */
function domRead(page) {
    return page.evaluate(() => {
        const one = (el) => (el ? {
            ariaHidden: el.getAttribute('aria-hidden'), dataAriaHidden: el.getAttribute('data-aria-hidden'),
            inert: el.hasAttribute('inert'),
            parent: el.parentElement ? `${el.parentElement.tagName}${el.parentElement.getAttribute('role') ? `[role=${el.parentElement.getAttribute('role')}]` : ''}` : null,
            visible: !!(el.offsetWidth || el.offsetHeight),
        } : null);
        const dp = document.getElementById('ui-datepicker-div');
        const hiddenAncestor = (el) => {
            for (let e = el && el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
                if (e.getAttribute('aria-hidden') === 'true') return e.tagName + (e.id ? `#${e.id}` : '');
            }
            return null;
        };
        return {calendar: one(dp), calendarHiddenAncestor: hiddenAncestor(dp),
            tinymceAux: [...document.querySelectorAll('.tox-tinymce-aux')].map(one)};
    });
}

/**
 * Click a window's date box (by its label's field: responseDueDate, reviewDueDate) and read what a
 * screen reader is given: the calendar's attributes, Chromium's accessibility tree under it, its
 * aria snapshot, and the date box's own role and name. Nothing is pressed inside the calendar.
 */
async function readCalendar(page, win, field) {
    const out = {field};
    const box = win.locator(`input.datepicker[id^="${field}"]`).first();
    try {
        await box.click();
        await picker(page).waitFor({state: 'visible', timeout: 10000}).catch(() => { out.calendarNotVisible = true; });
        await sleep(800); // Chromium's accessibility tree settles after the DOM
        out.dom = await domRead(page);
        out.ax = await axExposure(page, '#ui-datepicker-div');
        out.ariaSnapshot = flat(await picker(page).ariaSnapshot().catch((e) => `err ${flat(e.message, 100)}`), 500);
        out.byRole = {
            links: await picker(page).getByRole('link').count(),
            month: await picker(page).getByRole('combobox', {name: 'Select month'}).count(),
            year: await picker(page).getByRole('combobox', {name: 'Select year'}).count(),
        };
        const label = field === 'responseDueDate' ? 'Response Due Date' : 'Review Due Date';
        out.boxByRole = await win.getByRole('textbox', {name: label}).count();
        out.exposed = !!(out.ax && out.ax.inTree && !out.ax.ignored && out.byRole.links > 0 && out.byRole.month > 0);
    } catch (e) {
        out.error = flat(e.message, 300);
    }
    return out;
}

/** Leave a window: the bottom "Cancel" link or the top "Close" button. Records what asked. */
async function leave(page, win, how) {
    const out = {how};
    try {
        if (how === 'close') await win.getByRole('button', {name: 'Close', exact: true}).first().click();
        else await win.getByRole('link', {name: 'Cancel', exact: true}).first().click();
        await win.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        await sleep(1200);
        await idle(page).catch(() => {});
        out.stillOpen = await win.isVisible().catch(() => false);
        out.after = await domRead(page);
    } catch (e) {
        out.error = flat(e.message, 300);
    }
    return out;
}

/** In the open workflow's Reviewers panel: a row's "More Actions" › "Edit"; returns the window. */
async function editFromRow(page, name) {
    const row = page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: name}).first();
    await row.waitFor({timeout: T});
    await row.getByRole('button', {name: /More Actions/}).first().click();
    await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
    const w = editWin(page);
    await w.locator('input.datepicker[id^="reviewDueDate"]').first().waitFor({timeout: T});
    await idle(page).catch(() => {});
    await sleep(600);
    return w;
}

/** "Add Reviewer", search, press the reviewer's "Select …"; returns the window with its form open. */
async function addReviewerWindow(page, {search, name}) {
    await page.getByRole('button', {name: 'Add Reviewer', exact: true}).first().click();
    const w = addWin(page);
    const box = w.locator('.listPanel--selectReviewer input.pkpSearch__input');
    await box.waitFor({timeout: T});
    await box.fill(search);
    await box.press('Enter');
    const item = w.locator('.listPanel--selectReviewer .listPanel__item').filter({hasText: name}).first();
    await item.waitFor({timeout: T});
    await idle(page).catch(() => {});
    for (let i = 0; i < 6 && !(await w.locator('#regularReviewerForm').isVisible().catch(() => false)); i++) {
        await item.getByRole('button', {name: /^Select /}).first().click({timeout: 5000}).catch(() => {});
        await w.locator('#regularReviewerForm').waitFor({timeout: 3000}).catch(() => {});
    }
    await w.locator('input.datepicker[id^="responseDueDate"]').first().waitFor({timeout: T});
    await idle(page).catch(() => {});
    await sleep(800);
    return w;
}

module.exports = {T, sleep, flat, SUBMISSION, editWin, addWin, picker, domRead, readCalendar, leave, editFromRow, addReviewerWindow};
