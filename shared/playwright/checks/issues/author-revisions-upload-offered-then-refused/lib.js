// Helpers of walk.js (U36 A7: the Author's "Upload" above "Revisions Uploaded" on a round that asks
// for no revisions; docs/issues/U36-A7-author-revisions-upload-offered-then-refused.md).
// Requiring this file runs nothing. Self-contained: the upload wizard's helpers were copied from
// ../change-file-keeps-first-upload/lib.js, the window and file helpers from
// ../author-update-file-details-offered-then-refused/lib.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {idle, sql, settled} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A small text file under `name` in a temp folder: {path, name}. */
function smallFile(name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'u36n16h-'));
    const p = path.join(dir, name);
    fs.writeFileSync(p, 'u36n16h notes\n');
    return {path: p, name};
}

/** The top visible window. */
const topWindow = (page) => page.locator('[role="dialog"]:visible').last();

/** Open a submission's workflow by address (the dashboard's "View"), optionally on a side-menu page. */
async function openWorkflowAt(page, app, id, menuKey, view = 'editorial') {
    const locale = app.line === 'stable-3_4_0' || app.line === 'stable-3_3_0' ? '' : '/en';
    await page.goto(app.url(`/index.php/${app.contextPath}${locale}/dashboard/${view}?workflowSubmissionId=${id}${menuKey ? `&workflowMenuKey=${menuKey}` : ''}`));
    await idle(page);
}

/** The table named `title` in the workflow. */
const tableNamed = (page, title) => page.getByRole('table', {name: title, exact: true});

/** The rows of the list `title`, each as its flat text; waits for the table to show. */
async function listRows(page, title) {
    const table = tableNamed(page, title);
    await table.first().waitFor({state: 'visible', timeout: T});
    await idle(page);
    const rows = table.first().locator('tbody tr').filter({has: page.getByRole('rowheader')});
    return (await rows.allInnerTexts()).map((t) => flat(t, 200));
}

/** "Upload" above the list `title`. */
function uploadButtonOf(page, title) {
    return page.locator('div')
        .filter({has: page.getByRole('heading', {name: title, exact: true, level: 3})})
        .filter({has: tableNamed(page, title)})
        .last()
        .getByRole('button', {name: /^Upload( File)?$/});
}

/** The open upload wizard (whatever its title) and its upload box. */
const wizard = (page) => page.getByRole('dialog').filter({has: page.locator('.pkp_controller_fileUpload')}).last();
const uploadBox = (page) => wizard(page).locator('.pkp_controller_fileUpload').first();

/** Choose `file` in the upload box and wait for its upload's answer and for the box to name it. */
async function pick(page, file) {
    const answered = page.waitForResponse((r) => /upload-file/.test(r.url()) && r.request().method() === 'POST', {timeout: 60_000});
    await wizard(page).locator('input[type="file"]').first().setInputFiles(file.path);
    const r = await answered;
    const body = await r.json().catch(() => null);
    await uploadBox(page).getByText(file.name).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
    return body && body.uploadedFile ? body.uploadedFile : body;
}

/** "Continue", "Continue", "Complete"; returns the step names passed and whether the window closed. */
async function finish(page) {
    const w = wizard(page);
    const passed = [];
    const current = async () => flat(await page.getByRole('dialog').last().locator('[role="tab"][aria-selected="true"]').first().innerText().catch(() => null), 40);
    for (const next of ['2. Review Details', '3. Confirm']) {
        const dlg = page.getByRole('dialog').filter({has: page.getByRole('tab', {name: next, exact: true})}).last();
        await dlg.getByRole('button', {name: 'Continue', exact: true}).click();
        await dlg.getByRole('tab', {name: next, exact: true}).and(page.locator('[aria-selected="true"]')).waitFor({timeout: T});
        await idle(page);
        passed.push(await current());
    }
    const dlg = page.getByRole('dialog').filter({has: page.getByRole('tab', {name: '3. Confirm', exact: true})}).last();
    const confirm = flat(await dlg.innerText().catch(() => null), 300);
    await dlg.getByRole('button', {name: 'Complete', exact: true}).click();
    await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
    await sleep(600); // the closed window's slot (patterns.md pitfall 4)
    return {passed, confirm, closed: !(await w.isVisible().catch(() => false))};
}

const LIST = 'Revisions Uploaded';
const REFUSAL = 'You are not allowed to add and edit these files.';

/** The table named "Revisions Uploaded". */
const listTable = (page) => page.getByRole('table', {name: LIST, exact: true});

/**
 * Collect, from now on, the review rounds every submission answer of the page carries (id, stage,
 * statusId, status), newest last: what the screen's buttons are decided from.
 */
function watchRounds(page) {
    const seen = [];
    page.on('response', async (r) => {
        if (!/\/api\/v1\/(_?submissions)\/\d+(\?|$)/.test(r.url()) || r.request().method() !== 'GET') return;
        const body = await r.json().catch(() => null);
        if (body && Array.isArray(body.reviewRounds)) {
            seen.push(body.reviewRounds.map((x) => ({id: x.id, stageId: x.stageId, round: x.round, statusId: x.statusId, status: x.status})));
        }
    });
    return {last: () => (seen.length ? seen[seen.length - 1] : null)};
}

/** The submission's review rounds as stored: id, stage, round, stored status. */
function storedRounds(app, submissionId) {
    const rows = sql(app, `select review_round_id, stage_id, round, status from review_rounds where submission_id = ${Number(submissionId)} order by 1`);
    return rows ? rows.split('\n').map((l) => { const [id, stageId, round, status] = l.split('|').map(Number); return {id, stageId, round, status}; }) : [];
}

/**
 * Open the submission's workflow from the dashboard's address ("My Submissions" for an author),
 * on the review round `round` ({id, stageId}) when given, else where the workflow opens.
 */
async function openWorkflow(page, app, id, {author = false, round = null} = {}) {
    await page.goto('about:blank');
    await openWorkflowAt(page, app, id, round ? `workflow_${round.stageId}_${round.id}` : undefined, author ? 'mySubmissions' : 'editorial');
    await page.locator('[data-cy="sidemodal-header"]').first().waitFor({timeout: 60_000});
    await listTable(page).first().waitFor({state: 'visible', timeout: 60_000});
    await idle(page);
}

/** What the round's page offers for uploading: the "Upload revisions" button, "Upload" above the list, the list's rows. */
async function offers(page) {
    return {
        uploadRevisions: await page.getByRole('button', {name: /^Upload revisions$/i}).first().isVisible().catch(() => false),
        upload: await uploadButtonOf(page, LIST).first().isVisible().catch(() => false),
        rows: await listRows(page, LIST).catch((e) => `threw ${flat(e.message, 120)}`),
    };
}

/**
 * Press `button` and say what opened: the upload wizard on its step 1 (`kind: 'wizard'`) or a
 * window with the refusal (`kind: 'refused'`), with the window's title, text and buttons and the
 * legacy requests the press sent.
 */
async function press(page, button) {
    const requests = [];
    const onResponse = async (r) => {
        if (!/\$\$\$call\$\$\$/.test(r.url())) return;
        requests.push({method: r.request().method(), url: r.url().replace(/^https?:\/\/[^/]+/, '').replace(/csrfToken=[^&]*/, 'csrfToken=…').slice(0, 260), status: r.status(), body: flat(await r.text().catch(() => null), 260)});
    };
    page.on('response', onResponse);
    await button.first().click();
    const box = page.locator('.pkp_controller_fileUpload');
    const refusal = page.getByText(REFUSAL);
    await box.or(refusal).first().waitFor({state: 'attached', timeout: T}).catch(() => {});
    await idle(page);
    const win = topWindow(page);
    await settled(page, win);
    const kind = (await refusal.count()) ? 'refused' : (await box.count()) ? 'wizard' : 'other';
    const out = {
        kind,
        title: flat(await win.locator('h1, h2').first().innerText().catch(() => null), 80),
        text: flat(await win.innerText().catch(() => null), 400),
        buttons: (await win.locator('button:visible, a.cancelButton:visible').allInnerTexts()).map((x) => flat(x, 40)).filter(Boolean),
        requests,
    };
    page.off('response', onResponse);
    return out;
}

/** The "Upload revisions" button under the round. */
const uploadRevisionsButton = (page) => page.getByRole('button', {name: /^Upload revisions$/i});

/** Press `button`, then take `file` through the upload window: the component, the file, "Continue", "Continue", "Complete". */
async function uploadThrough(page, button, component, file) {
    await button.first().click();
    await uploadBox(page).waitFor({state: 'attached', timeout: T});
    await idle(page);
    await wizard(page).locator('select[id^="genreId"]').selectOption({label: component});
    const uploaded = await pick(page, file);
    const done = await finish(page);
    return {uploaded: uploaded && (uploaded.id || uploaded.submissionFileId || uploaded), ...done};
}

/** On "My Submissions", press the header's "Tasks" and return the button's text and what the panel lists. */
async function tasks(page, app) {
    await page.goto('about:blank');
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/mySubmissions`));
    await idle(page);
    const button = page.getByRole('button', {name: /^Tasks/}).first();
    const header = flat(await button.innerText().catch(() => null), 30);
    await button.click();
    await idle(page);
    const panel = topWindow(page);
    await settled(page, panel);
    return {header, panel: flat(await panel.innerText().catch(() => null), 500)};
}

module.exports = {T, flat, smallFile, topWindow, uploadRevisionsButton, uploadThrough, tasks, LIST, REFUSAL, watchRounds, storedRounds, openWorkflow, offers, press, uploadButton: (page) => uploadButtonOf(page, LIST), listTable};
