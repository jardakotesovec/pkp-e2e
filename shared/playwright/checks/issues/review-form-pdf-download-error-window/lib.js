// Helpers of walk.js here (spec U27, register A55). Requiring this file runs nothing. Every helper
// drives the screens a person uses: Settings › Workflow › "Review" › "Review Forms" (a form with one
// item, made active), the workflow's "Reviewers" panel (a row's "Edit" › "Review Form", "Read
// Review"), the reviewer's own review, and Review Details › "Download Review Form".
// createActiveReviewForm, openWorkflow, giveReviewForm and openStep3 are copied from
// ../review-form-save-for-later-required-fields/lib.js (U28 A14), pdfText from
// ../../U27/I27/i27.js; never required from there.
const fs = require('fs');
const path = require('path');
const {idle, launch, outFile} = require('../../../probe');

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
 * row's "Edit" › "Form Items" › "Create New Item" per item (`{question, type, required}`), the
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
        await forms.saveItem({question: item.question, required: !!item.required, type: item.type});
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

/** Step 3: type the answer into the question's box, (journal) choose the recommendation, "Submit Review", "OK". */
async function answerAndSubmit(page, app, {question, answer, recommendation}) {
    const w = wizard(page, app);
    const box = page.locator('#reviewStep3Form .section').filter({hasText: question}).last().locator('input[type="text"], textarea').first();
    await box.click();
    await box.pressSequentially(answer, {delay: 10});
    // the journal's "Recommendation" list (`reviewerRecommendationId` on main, `recommendation` on 3.5)
    const rec = page.locator('#reviewStep3Form select[name="reviewerRecommendationId"], #reviewStep3Form select[name="recommendation"]');
    if (await rec.count()) await rec.first().selectOption({label: recommendation});
    await w.submitReview();
    await w.expectCompleted();
    return {completed: await w.completedHeading.isVisible()};
}

/** The "Review Details" window (3.5 heads it "Review: <title>"). */
const reviewDetails = (page) => page.getByRole('dialog', {name: /^Review( Details)?:/}).last();
const reviewersTable = (page) => page.getByRole('table', {name: 'Reviewers', exact: true});

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

/** pdf.js of the app's own PDF viewer plugin, in a second browser that leaves the run record alone. */
function pdfReader(app) {
    let b = null;
    return {
        async text(file) {
            try {
                if (!b) {
                    b = await launch(app, {record: false});
                    await b.page.goto(app.url('/plugins/generic/pdfJsViewer/pdf.js/LICENSE'));
                }
                const b64 = fs.readFileSync(file).toString('base64');
                return await b.page.evaluate(async (data) => {
                    const lib = await import('/plugins/generic/pdfJsViewer/pdf.js/build/pdf.mjs');
                    lib.GlobalWorkerOptions.workerSrc = '/plugins/generic/pdfJsViewer/pdf.js/build/pdf.worker.mjs';
                    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
                    const doc = await lib.getDocument({data: bytes}).promise;
                    const out = [];
                    for (let i = 1; i <= doc.numPages; i++) {
                        const tc = await (await doc.getPage(i)).getTextContent();
                        out.push(tc.items.map((x) => x.str).join(' '));
                    }
                    return {pages: doc.numPages, text: out.join(' \n ')};
                }, b64);
            } catch (e) { return {error: flat(e.message, 300)}; }
        },
        async close() { if (b) await b.close().catch(() => {}); },
    };
}

/**
 * Review Details › "Download Review Form" › the entry. Records the export request's status, whether a
 * file arrived (its name, size, text), whether an "Error" window opened (its presence and its "OK"
 * only: its text is not kept), and the window's state after. Never throws on the state a fix brings.
 */
async function download(page, app, entry, label, {pdf, log}) {
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
                const keep = outFile(`a55-dl-${label}${path.extname(out.file) || ''}`);
                fs.copyFileSync(file, keep);
                out.kept = path.basename(keep);
                if (/\.pdf$/i.test(out.file)) {
                    const t = await pdf.text(file);
                    out.pdf = t && t.text ? {pages: t.pages, text: flat(t.text, 1500)} : t;
                }
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
    T, sleep, flat, CASES, ENTRIES, createActiveReviewForm, openWorkflow, giveReviewForm, openStep3, answerAndSubmit,
    reviewDetails, openReviewDetails, closeReviewDetails, pdfReader, download, pressErrorOk, closeOpenMenu,
};
