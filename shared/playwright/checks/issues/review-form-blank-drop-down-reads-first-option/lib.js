// Helpers of walk.js here (spec U27, register A57). Requiring this file runs nothing. Every helper
// drives the screens a person uses: Settings › Workflow › "Review" › "Review Forms" (a form with its
// items, made active), the workflow's "Reviewers" panel (a row's "Edit" › "Review Form", "Read
// Review"), the reviewer's own review, and Review Details › "Download Review Form".
// Copied from ../review-form-pdf-download-error-window/lib.js (U27 A55; its own copies from
// ../review-form-save-for-later-required-fields/lib.js and ../../U27/I27/i27.js), never required
// from there. New here: answerChoices (step 6), answerUnder (Review Details), and the XML file's text
// in download(); the PDF reader is left out. addOption and saveOpenItem are copied from
// ../review-form-item-text-type-drops-options/lib.js (U29).
const fs = require('fs');
const path = require('path');
const {idle, outFile} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

const ACTIVATE_FORM = /activate this review form/i;

/**
 * Per app, on PKP's default test dataset (docs/process/dataset.md): a submission in review with an
 * unanswered request (given the form) and a completed free-form review (the control).
 */
const CASES = {
    ojs: {id: 7, reviewer: {name: 'Aisla McCrae', username: 'amccrae'}, control: {name: 'Paul Hudson'}},
    omp: {id: 16, reviewer: {name: 'Al Zacharia', username: 'alzacharia'}, control: {name: 'Adela Gallego'}},
};

const ENTRIES = {
    editorPdf: /All Review Sections.*PDF/i,
    authorPdf: /Author-Only.*PDF/i,
    editorXml: /All Review Sections.*XML/i,
    authorXml: /Author-Only.*XML/i,
};

/** The journal's review page objects (the Reviewers panel is the same on a press). */
const R = () => require('../../../../../apps/ojs/playwright/pages/ReviewStagePages.js');

function wizard(page, app) {
    const {ReviewWizardPage} = require('../../../pages/ReviewerPages.js');
    return new ReviewWizardPage(page, app.contextPath, {privateBoxLabel: app.name === 'omp' ? 'For editor only' : 'For editor'});
}

/**
 * Settings › Workflow › "Review" › "Review Forms": "Create Review Form" with the title, then the
 * row's "Edit" › "Form Items" › "Create New Item" per item (`{question, type, required, options}`), the
 * window closed, and the row's "Active" box ticked with "OK". Returns the row's text.
 */
async function createActiveReviewForm(page, app, {title, items}) {
    const {ReviewSettingsPage} = require('../../../pages/ReviewSettingsPages.js');
    const settings = new ReviewSettingsPage(page, app.contextPath);
    const forms = settings.forms;
    await settings.goto('Review Forms');
    await idle(page);
    await forms.createForm(title);
    const controls = await forms.rowControls(forms.row(title).first());
    await forms.control(controls, 'Edit').click();
    await forms.windowHeading().waitFor({timeout: T});
    await forms.openWindowTab('Form Items');
    for (const item of items) {
        await forms.openCreateItem();
        await forms.fillItem({question: item.question, required: !!item.required, type: item.type});
        for (const option of item.options || []) await addOption(page, forms, option);
        await saveOpenItem(page, forms, item.question);
    }
    const listed = (await forms.itemRows().allInnerTexts()).map((t) => flat(t, 120));
    await forms.closeWindow();
    await settings.goto('Review Forms');
    await idle(page);
    await forms.activeBox(forms.row(title).first()).click();
    await forms.answerConfirm(ACTIVATE_FORM, 'OK');
    await idle(page);
    const row = forms.row(title).first();
    return {items: listed, active: await forms.activeBox(row).isChecked(), row: flat(await row.innerText(), 160)};
}

/** "Add Item" under "Response Options", the text typed into the row's English box, Enter. The
 * dataset's context has two languages, so a new row carries a box per language (the page object's
 * addResponseOption expects one). */
async function addOption(page, forms, text) {
    const {expect} = require('@playwright/test');
    const inputs = forms.itemForm.locator('input[name^="newRowId[possibleResponse]"]');
    const before = await inputs.count();
    await forms.itemAddOptionLink.dispatchEvent('mousedown');
    await expect.poll(() => inputs.count(), {timeout: T}).toBeGreaterThan(before);
    const box = forms.itemForm.locator('input[name^="newRowId[possibleResponse]"][name$="[en]"]').last();
    await box.fill(text);
    await box.press('Enter');
    await idle(page);
    await forms.responseOptionRow(text).first().waitFor({timeout: T});
}

/** The open item window's "Save": the window closes and the item's row lists. */
async function saveOpenItem(page, forms, question) {
    const saved = page.waitForResponse((r) => r.url().includes('/update-review-form-element') && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await forms.itemSaveButton.click();
    const response = await saved;
    const body = response ? await response.json().catch(() => null) : null;
    if (body && body.status === false) throw new Error(`The item window refused the save: ${flat(String(body.content || '').replace(/<[^>]+>/g, ' '), 400)}`);
    await forms.itemForm.waitFor({state: 'hidden', timeout: T});
    await idle(page);
    await forms.itemRow(question).first().waitFor({timeout: T});
}

/** The editor's workflow of the submission, on the stage and round it opens on. */
async function openWorkflow(page, app, id) {
    await page.goto('about:blank');
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${id}`));
    const modal = page.locator('[data-cy="active-modal"]').first();
    await modal.locator('[data-cy="reviewer-manager"]').waitFor({timeout: T});
    await idle(page);
    return modal;
}

/** The reviewer's row "Edit": choose the form under "Review Form", "OK". Returns the list's options and the choice. */
async function giveReviewForm(page, app, id, name, title) {
    const modal = await openWorkflow(page, app, id);
    const row = modal.locator('[data-cy="reviewer-manager"]').getByRole('row').filter({hasText: name});
    await row.first().waitFor({timeout: T});
    await R().clickRowAction(page, row.first(), 'Edit');
    const edit = R().legacyModal(page, 'editReviewForm');
    const select = edit.locator('select[name="reviewFormId"]');
    await select.waitFor({timeout: T});
    await idle(page);
    const options = (await select.locator('option').allInnerTexts()).map((t) => flat(t, 80));
    await select.selectOption({label: title});
    const saved = page.waitForResponse((r) => /update-review|updateReview/i.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await edit.getByRole('button', {name: 'OK', exact: true}).click();
    const s = await saved;
    await edit.locator('form#editReviewForm').waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
    return {options, chose: title, status: s ? s.status() : null};
}

/** The signed-in reviewer's review: step 1 accepted (privacy box ticked when shown), on to step 3. */
async function openStep3(page, app, id) {
    const w = wizard(page, app);
    await page.goto('about:blank');
    await page.goto(app.url(`/index.php/${app.contextPath}/en/reviewer/submission/${id}`));
    await w.expectOpen();
    const out = {heading: flat(await page.getByRole('heading', {level: 1}).first().innerText(), 160)};
    await w.accept();
    await w.continueToStep3();
    await w.expectStep(3);
    await w.step3Form.waitFor({timeout: T});
    await idle(page);
    return out;
}

/**
 * Step 3: the drop-down left on its empty choice or set to `dropDown`, the radio group left unchosen or
 * set to `radio`, (journal) the recommendation, "Submit Review", "OK". Returns what the drop-down read
 * before the submit (its selected label and value, and its option labels).
 */
async function answerChoices(page, app, {dropQuestion, dropDown = null, radioQuestion, radio = null, recommendation}) {
    const w = wizard(page, app);
    const section = (q) => page.locator('#reviewStep3Form .section').filter({hasText: q}).last();
    const select = section(dropQuestion).locator('select').first();
    await select.waitFor({timeout: T});
    if (dropDown !== null) await select.selectOption({label: dropDown});
    if (radio !== null) await section(radioQuestion).getByRole('radio', {name: radio, exact: true}).check();
    const out = {
        dropDownOptions: (await select.locator('option').allInnerTexts()).map((t) => flat(t, 80)),
        dropDownValue: await select.inputValue(),
        dropDownSelected: flat(await select.evaluate((s) => (s.selectedOptions[0] ? s.selectedOptions[0].textContent : null)), 80),
        radioChecked: await section(radioQuestion).getByRole('radio', {checked: true}).count(),
    };
    // the journal's "Recommendation" list (`reviewerRecommendationId` on main, `recommendation` on 3.5)
    const rec = page.locator('#reviewStep3Form select[name="reviewerRecommendationId"], #reviewStep3Form select[name="recommendation"]');
    if (await rec.count()) await rec.first().selectOption({label: recommendation});
    const posted = page.waitForRequest((r) => r.method() === 'POST' && (r.postData() || '').includes('reviewFormResponses'), {timeout: T}).catch(() => null);
    await w.submitReview();
    const req = await posted;
    if (req) {
        const body = req.postData() || '';
        out.posted = decodeURIComponent(body.replace(/\+/g, ' ')).split('&').filter((kv) => /^reviewFormResponses/.test(kv));
    }
    await w.expectCompleted();
    out.completed = await w.completedHeading.isVisible();
    return out;
}

/** The "Review Details" window (3.5 heads it "Review: <title>"). */
const reviewDetails = (page) => page.getByRole('dialog', {name: /^Review( Details)?:/}).last();
const reviewersTable = (page) => page.getByRole('table', {name: 'Reviewers', exact: true});

/**
 * Review Details: the text that follows a question up to the next question (or the "Reviewer Files"
 * block), as the window shows it.
 */
function answerUnder(windowText, question, others) {
    const t = String(windowText || '');
    const i = t.indexOf(question);
    if (i < 0) return {found: false};
    let rest = t.slice(i + question.length);
    let end = rest.length;
    for (const stop of [...others, 'Reviewer Files', 'Reviewer Recommendation', 'Reviewer rating']) {
        const j = rest.indexOf(stop);
        if (j >= 0 && j < end) end = j;
    }
    return {found: true, answer: flat(rest.slice(0, end), 200)};
}

/** "Read Review" on the reviewer's row (the row's "More Actions" › "Review Details" when the row has none). */
async function openReviewDetails(page, name) {
    const row = reviewersTable(page).getByRole('row').filter({hasText: name}).first();
    await row.waitFor({timeout: T});
    const out = {row: flat(await row.innerText(), 300)};
    const read = row.getByRole('button', {name: 'Read Review', exact: true});
    out.via = 'Read Review';
    if (await read.count()) await read.click();
    else {
        out.via = 'More Actions › Review Details';
        await R().clickRowAction(page, row, 'Review Details');
    }
    await reviewDetails(page).waitFor({timeout: T});
    await reviewDetails(page).getByRole('button', {name: /Download Review Form/}).first().waitFor({timeout: T}).catch(() => { out.noDownloadButton = true; });
    await idle(page);
    return out;
}

/** The window's own "Close", then the modal store's close slot (patterns pitfall 4f). */
async function closeReviewDetails(page) {
    const c = reviewDetails(page).getByRole('button', {name: 'Close', exact: true}).first();
    if (await c.count()) await c.click().catch(() => {});
    await reviewDetails(page).waitFor({state: 'hidden', timeout: 10_000}).catch(() => {});
    await sleep(600);
}

/**
 * Review Details › "Download Review Form" › the entry. Records the export request's status, whether a
 * file arrived (its name, size, an XML file's text), whether an "Error" window opened (its presence and its "OK"
 * only: its text is not kept), and the window's state after. Never throws on the state a fix brings.
 */
async function download(page, app, entry, label, {log}) {
    const out = {entry};
    const t0 = Date.now();
    const from = log.mark();
    const requests = [];
    const onResp = (r) => { if (/\/reviews\/\d+\/(\d+\/export-(pdf|xml)|exports\/)/.test(r.url())) requests.push(`${r.request().method()} ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); };
    page.on('response', onResp);
    try {
        const btn = reviewDetails(page).getByRole('button', {name: /Download Review Form/});
        await btn.first().click();
        await page.getByRole('menuitem').first().waitFor({timeout: 10_000}).catch(() => {});
        out.items = (await page.getByRole('menuitem').allInnerTexts().catch(() => [])).map((x) => flat(x, 80));
        const item = page.getByRole('menuitem').filter({hasText: ENTRIES[entry]}).first();
        out.pressed = flat(await item.innerText({timeout: 5000}).catch(() => '(none)'), 80);
        const answer = page.waitForResponse((r) => /\/reviews\/\d+\/\d+\/export-(pdf|xml)/.test(r.url()), {timeout: 60_000}).catch(() => null);
        const arrived = page.waitForEvent('download', {timeout: 60_000}).catch((e) => ({err: flat(e.message, 100)}));
        await item.click({timeout: 5000}).catch((e) => { out.itemClick = flat(e.message, 160); });
        const a = await answer;
        out.exportStatus = a ? a.status() : null;
        const d = a && a.ok() ? await arrived : await Promise.race([arrived, sleep(4000).then(() => ({err: 'no download within 4 s of a failed export answer'}))]);
        await sleep(1000);
        await idle(page).catch(() => {});
        if (d && !d.err) {
            const file = await d.path().catch(() => null);
            out.file = d.suggestedFilename();
            out.bytes = file ? fs.statSync(file).size : null;
            if (file) {
                const keep = outFile(`a57-dl-${label}${path.extname(out.file) || ''}`);
                fs.copyFileSync(file, keep);
                out.kept = path.basename(keep);
                if (/\.xml$/i.test(out.file)) out.xml = flat(fs.readFileSync(file, 'utf8'), 4000);
            }
        } else out.noFile = d && d.err;
        out.windowOpen = await reviewDetails(page).isVisible().catch(() => false);
        const err = page.getByRole('dialog', {name: 'Error', exact: true});
        out.errorWindow = (await err.count()) > 0;
        if (out.errorWindow) {
            out.errorWindowButtons = (await err.last().getByRole('button').allInnerTexts().catch(() => [])).map((x) => flat(x, 40));
        }
    } catch (e) {
        out.threw = flat(e.message, 400);
    } finally {
        await sleep(300);
        page.off('response', onResp);
        out.requests = requests;
        out.serverLog = log.since(from).map((l) => flat(l, 300));
    }
    return out;
}

/** The "Error" window's "OK" (step 9): what is left afterwards. */
async function pressErrorOk(page) {
    const err = page.getByRole('dialog', {name: 'Error', exact: true});
    if (!(await err.count())) return {errorWindow: false};
    await err.last().getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
    await err.last().waitFor({state: 'hidden', timeout: 10_000}).catch(() => {});
    await sleep(600);
    return {
        errorWindow: true,
        errorWindowsLeft: await err.count(),
        reviewDetailsOpen: await reviewDetails(page).isVisible().catch(() => false),
        downloadButton: await reviewDetails(page).getByRole('button', {name: /Download Review Form/}).count(),
    };
}

/** Close a "Download Review Form" menu left open (never a page Escape: pitfall 3b). */
async function closeOpenMenu(page) {
    const m = page.locator('[data-reka-menu-content][role="menu"]');
    if (await m.count()) await m.press('Escape').catch(() => {});
}

module.exports = {
    T, sleep, flat, CASES, ENTRIES, createActiveReviewForm, openWorkflow, giveReviewForm, openStep3, answerChoices,
    reviewDetails, answerUnder, openReviewDetails, closeReviewDetails, download, pressErrorOk, closeOpenMenu,
};
