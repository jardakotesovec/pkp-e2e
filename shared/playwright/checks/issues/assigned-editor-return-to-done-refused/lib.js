// Helpers of walk.js (issue report
// docs/issues/U24-A15-assigned-editor-return-to-done-refused.md). Requiring this file
// runs nothing. Every helper presses what a person presses, or types an address; the page
// objects are required inside the helpers (the kit exports the app's root while the script's
// function runs). Each helper records what it meets and never throws on a missing control, so
// the same walk runs with a fix in or out.
const {idle, screen, record} = require('../../../probe');

const T = 30_000;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

const DIALOG_TEXT = {
    'Return to Workflow': 'Return this submission to the workflow stage it occupied before it was moved to Done.',
    'Return to Done': 'Return this submission to the Done stage.',
};

function workflow(page, app) {
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    return new WorkflowPage(page, app.contextPath);
}

/** Open the submission's workflow by its address (after a blank page, so it is a fresh load). */
async function open(page, app, sid) {
    await page.goto('about:blank');
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${sid}`));
    await page.locator('[data-cy="sidemodal-header"]').first().waitFor({timeout: T}).catch(() => {});
    await idle(page).catch(() => {});
    await pause(1_500);
    await idle(page).catch(() => {});
}

/** The header as the user sees it: the stage bubble and the buttons, left to right. */
async function readHeader(page, app) {
    const wf = workflow(page, app);
    return {
        bubble: flat(await wf.stageBubble().first().innerText().catch(() => null), 60),
        buttons: await wf.headerButtonLabels().catch(() => []),
    };
}

/**
 * Press a header button ("Return to Workflow" / "Return to Done"), read its dialog, press
 * "Confirm", and read what follows: the request the press sent (method, path, status, the
 * answer's `error`), an "Error" window's text (then its "OK"), the header after, and the header
 * after a reload. `label` names the snapshots.
 */
async function pressAndConfirm(page, app, sid, button, label) {
    const wf = workflow(page, app);
    const out = {button, offered: (await wf.headerButton(button).count()) > 0};
    if (!out.offered) {
        out.header = await readHeader(page, app);
        record(`${label}-not-offered`, await screen(page));
        return out;
    }
    await wf.headerButton(button).click();
    const dialog = page.getByRole('dialog', {name: button, exact: true});
    await dialog.waitFor({timeout: T}).catch(() => {});
    out.dialog = {
        text: flat(await dialog.innerText().catch(() => null), 300),
        bodyMatches: (await dialog.filter({hasText: DIALOG_TEXT[button]}).count()) > 0,
        buttons: (await dialog.getByRole('button').allInnerTexts().catch(() => [])).map((t) => flat(t)).filter(Boolean),
    };
    record(`${label}-dialog`, await screen(page));
    const requests = [];
    const listen = async (r) => {
        const u = new URL(r.url());
        if (r.request().method() === 'POST' && new RegExp(`/api/v1/submissions/${sid}/(decisions|returnToDone)$`).test(u.pathname)) {
            let body = null;
            try {
                body = await r.json();
            } catch (e) {
                body = null;
            }
            requests.push({path: u.pathname.replace(/^.*\/api\//, 'api/'), post: r.request().postData(), status: r.status(),
                error: body && (body.error || null), errorMessage: body && (body.errorMessage || null)});
        }
    };
    page.on('response', listen);
    try {
        await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
        await idle(page).catch(() => {});
        await pause(2_000);
        await idle(page).catch(() => {});
    } finally {
        page.off('response', listen);
    }
    out.requests = requests;
    const error = page.getByRole('dialog', {name: 'Error', exact: true});
    out.errorWindow = (await error.count()) > 0 && (await error.isVisible().catch(() => false));
    record(`${label}-after-confirm`, await screen(page));
    if (out.errorWindow) {
        out.errorText = flat(await error.innerText().catch(() => null), 300);
        out.errorButtons = (await error.getByRole('button').allInnerTexts()).map((t) => flat(t)).filter(Boolean);
        await error.getByRole('button', {name: 'OK', exact: true}).click();
        await error.waitFor({state: 'detached', timeout: T}).catch(() => {});
        await pause(1_000);
        record(`${label}-after-ok`, await screen(page));
    }
    out.headerAfter = await readHeader(page, app);
    await open(page, app, sid);
    out.headerAfterReload = await readHeader(page, app);
    record(`${label}-after-reload`, await screen(page));
    return out;
}

module.exports = {flat, open, readHeader, pressAndConfirm};
