// Helpers of the U27 A50 walk (./walk.js); requiring this file runs nothing.
// Every helper drives the screens an editor uses: the workflow's "Reviewers" panel, its
// "Add Reviewer" window and that window's "Enroll Existing User" form.
const {idle, screen, record, shot, serverLog} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** The editor's workflow of the submission, on the stage and round it opens on. Returns the workflow dialog. */
async function openWorkflow(page, app, id) {
    await page.goto('about:blank');
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${id}`));
    const modal = page.locator('[data-cy="active-modal"]').first();
    await modal.locator('[data-cy="reviewer-manager"]').waitFor({timeout: T});
    await idle(page);
    return modal;
}

/** The workflow's heading lines naming the review stage and round. */
async function stageHeading(modal) {
    return flat(await modal.locator('h2, h3').filter({hasText: /Review/}).allInnerTexts().then((a) => a.join(' | ')), 300);
}

/** The "Reviewers" panel's text (its rows). */
async function rows(modal) {
    return flat(await modal.locator('[data-cy="reviewer-manager"]').innerText().catch(() => null), 1500);
}

/** "Reviewers" › "Add Reviewer", then "Enroll Existing User": the enroll form's window. */
async function openEnroll(page) {
    const {ReviewerRequestWindow} = require('../../../pages/ReviewerSuggestionPages.js');
    await page.getByRole('button', {name: 'Add Reviewer', exact: true}).first().click();
    const win = new ReviewerRequestWindow(page);
    await win.dialog().waitFor({timeout: T});
    await idle(page);
    const link = win.dialog().locator('a, button').filter({hasText: /^\s*Enroll Existing User\s*$/}).first();
    await link.waitFor({timeout: T});
    await link.click();
    await win.enrollHeading().waitFor({timeout: T});
    await win.expectOpen();
    return win;
}

/** Type into "Search By Name"; returns the autocomplete's answers and the menu entries shown. */
async function typeSearch(page, win, text, answers) {
    const before = answers.length;
    await win.searchByName().click();
    await win.searchByName().pressSequentially(text, {delay: 80});
    for (let i = 0; i < 40 && answers.length === before; i++) await sleep(250);
    await sleep(600);
    const items = await page.locator('ul.ui-autocomplete:visible li').allInnerTexts().catch(() => []);
    return {answer: answers.slice(before), menu: items.map((t) => flat(t, 200))};
}

/** The menu entry with this text (a locator; count() 0 when not offered). */
function menuEntry(page, text) {
    return page.locator('ul.ui-autocomplete:visible li').filter({hasText: text}).first();
}

/** The box's text and the hidden user id the form sends. */
async function fieldState(win) {
    return win
        .dialog()
        .locator('#enrollExistingReviewerForm')
        .evaluate((f) => {
            const hid = f.querySelector('input[type=hidden][name="userId"]');
            const txt = f.querySelector('input[id^="userId_input"]');
            return {hiddenUserId: hid ? hid.value : '(none)', text: txt ? txt.value : '(none)'};
        })
        .catch((e) => ({error: String(e.message).slice(0, 200)}));
}

/**
 * Press the form's "Add Reviewer" and read what follows: the request (or none, when the
 * browser refuses the form itself), then the window 5 s on: spinner, button state, field
 * messages, notices, and the server log lines written since. Records the screen as `name`.
 */
async function pressAddAndRead(page, app, win, name) {
    const log = serverLog(app),
        from = log.mark();
    const out = {};
    await win.settled();
    const answered = page
        .waitForResponse((r) => /\/reviewer-grid\/enroll-reviewer/.test(r.url()) && r.request().method() === 'POST', {timeout: 8_000})
        .catch(() => null);
    await win.addReviewerButton().click();
    const resp = await answered;
    out.requestSent = !!resp;
    if (resp) {
        out.status = resp.status();
        out.body = flat(await resp.text().catch(() => ''), 600);
    }
    await sleep(5_000);
    const d = win.dialog();
    out.windowOpen = await d.isVisible().catch(() => false);
    if (out.windowOpen) {
        out.spinnerVisible = await d.locator('.pkp_spinner:visible').count().catch(() => null);
        out.addButtonDisabled = await win.addReviewerButton().isDisabled().catch(() => null);
        out.fieldMessages = await d.locator('label.error:visible, .error:visible').allInnerTexts().catch(() => []);
        out.field = await fieldState(win);
    }
    out.serverLog = log.since(from).map((l) => flat(l, 400));
    const s = await screen(page);
    out.notices = s.notices;
    record(`a50-${name}`, s);
    await shot(page, `a50-${name}`);
    return out;
}

module.exports = {sleep, flat, openWorkflow, stageHeading, rows, openEnroll, typeSearch, menuEntry, fieldState, pressAddAndRead};
