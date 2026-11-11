// Helpers of walk.js (issue report docs/issues/U34-OPS3-limited-moderator-posted-preprint-error.md).
// Requiring this file runs nothing. Every helper presses what a person presses, or types an
// address; the page objects are required inside the helpers (the kit exports the app's root while
// the script's function runs).
const {idle, screen, record} = require('../../../probe');

const T = 30_000;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const MODERATOR = 'Stephanie Berardo';
const DECISION_BUTTONS = ['Return to Workflow', 'Return to Done', 'Move to Done', 'Post the preprint', 'Decline Submission',
    'Revert Decline', 'Send to Production', 'Publish', 'Unpost', 'Unpublish'];

/**
 * Per app, on PKP's default test dataset for `main` (and stable-3_5_0): the published (posted)
 * submission the steps open, its title as the lists show it, the role Stephanie Berardo holds
 * there, and whether the dataset already assigns her (OMP: no published book has her, so the
 * steps assign her). `production` is a submission in Production she is assigned to (the
 * neighbour's limited case on the preprint server); `posted` another posted one for the neighbour.
 */
const CASES = {
    ojs: {submissionId: 1, title: 'Signalling Theory Dividends', role: 'Section editor', assigned: true},
    omp: {submissionId: 14, title: 'From Bricks to Brains', role: 'Series editor', assigned: false},
    ops: {submissionId: 2, title: 'The Facets Of Job Satisfaction', role: 'Moderator', assigned: true,
        production: 1, posted: 5},
};

function participants(page, app) {
    const {ParticipantsPanel} = require('../../../pages/StageParticipantsPages.js');
    return new ParticipantsPanel(page, app.contextPath);
}

/**
 * A published submission's workflow opens on its Done view, which has no Participants panel: select
 * "Production" in the side menu, as a person does. Returns whether that was needed.
 */
async function toParticipants(page, app) {
    const panel = participants(page, app);
    if (await panel.heading().count()) {
        return false;
    }
    await panel.selectStage('Production');
    await panel.row(MODERATOR).first().waitFor({timeout: T}).catch(() => {});
    return true;
}

/** Open a submission's workflow by its address; `api` is the answers of GET submissions/{id}. */
async function openByAddress(page, app, sid) {
    const api = [];
    const listen = (r) => {
        const u = new URL(r.url());
        if (r.request().method() === 'GET' && new RegExp(`/api/v1/submissions/${sid}$`).test(u.pathname)) {
            api.push(r.status());
        }
    };
    page.on('response', listen);
    try {
        await page.goto('about:blank');
        await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${sid}`));
        await settle(page);
    } finally {
        page.off('response', listen);
    }
    return api;
}

async function settle(page) {
    await page.locator('[data-cy="sidemodal-header"]').first().waitFor({timeout: T}).catch(() => {});
    await idle(page).catch(() => {});
    await pause(2_000);
    await idle(page).catch(() => {});
}

/**
 * What the workflow shows now: the "Error" window (its text) and, after its "OK", the header's
 * number line and title, the side menu's entries, the header's action buttons and whether the
 * Participants panel is there. Records the screen before and after "OK".
 */
async function readWorkflow(page, label) {
    const out = {};
    const error = page.getByRole('dialog', {name: 'Error', exact: true});
    out.errorWindow = (await error.count()) > 0 && (await error.isVisible().catch(() => false));
    record(`${label}-opened`, await screen(page));
    if (out.errorWindow) {
        out.errorText = flat(await error.innerText().catch(() => null), 300);
        out.errorButtons = (await error.getByRole('button').allTextContents()).map((t) => flat(t));
        await error.getByRole('button', {name: 'OK', exact: true}).click();
        await error.waitFor({state: 'detached', timeout: T}).catch(() => {});
        await pause(1_000);
        record(`${label}-after-ok`, await screen(page));
    }
    const header = page.locator('[data-cy="sidemodal-header"]').first();
    out.number = flat(await header.locator('.text-xl-medium').first().innerText().catch(() => null), 80);
    out.title = flat(await header.locator('h1').first().innerText().catch(() => null), 200);
    out.menu = (await page.locator('nav a').evaluateAll((els) =>
        els.filter((e) => e.closest('[role="dialog"]')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)
    ).catch(() => []));
    // The decision buttons the workflow offers: the header's ("Return to Workflow") and the stage's
    // ("Post the preprint", "Decline Submission").
    out.decisionButtons = [];
    for (const name of DECISION_BUTTONS) {
        if (await page.getByRole('button', {name, exact: true}).count()) {
            out.decisionButtons.push(name);
        }
    }
    out.actions = (await page.locator('[data-cy="workflow-action-items"] button').allTextContents().catch(() => []))
        .map((t) => flat(t)).filter(Boolean);
    out.participantsPanel = (await page.locator('[data-cy="workflow-secondary-items"] h3')
        .filter({hasText: /^\s*Participants\s*$/i}).count()) > 0;
    return out;
}

/**
 * As the manager: Participants › Stephanie Berardo's "More Actions" › "Edit", tick the
 * recommend-only box, "OK". Returns the box's label and state before, the notices and the row after
 * a reload.
 */
async function limitByEdit(page, app, sid) {
    const panel = participants(page, app);
    await openByAddress(page, app, sid);
    const production = await toParticipants(page, app);
    const win = await panel.openEdit(MODERATOR);
    const box = win.recommendOnlyBox();
    const out = {
        label: flat(await box.evaluate((el) => (el.closest('label') || el.parentElement).innerText).catch(() => null), 240),
        before: await box.isChecked(),
        selectedProduction: production,
    };
    await box.check();
    await win.ok();
    out.notices = (await screen(page)).notices;
    await openByAddress(page, app, sid);
    await toParticipants(page, app);
    out.rowAfterReload = (await panel.rowLines()).find((l) => l.includes(MODERATOR)) || null;
    return out;
}

/**
 * As the manager: Participants › "Assign", the role, "Search", Stephanie Berardo, the
 * recommend-only box ticked, "OK". Returns the notices and the row after a reload.
 */
async function assignLimited(page, app, sid, role) {
    const panel = participants(page, app);
    await openByAddress(page, app, sid);
    const production = await toParticipants(page, app);
    const win = await panel.openAssign();
    await idle(page);
    await win.chooseRole(role);
    await win.search();
    await win.choosePerson(MODERATOR);
    const box = win.recommendOnlyBox();
    await box.waitFor({state: 'visible', timeout: T});
    await box.check();
    await win.ok();
    const out = {selectedProduction: production, notices: (await screen(page)).notices};
    await openByAddress(page, app, sid);
    await toParticipants(page, app);
    out.rowAfterReload = (await panel.rowLines()).find((l) => l.includes(MODERATOR)) || null;
    return out;
}

/**
 * The Dashboard's "Published" view, the submission's row (found by its title), "View". Returns
 * whether the view and the row were found and the answers of GET submissions/{id}.
 */
async function openFromPublished(page, app, sid, title) {
    const {EditorialDashboardPage} = require('../../../pages/EditorialDashboardPage.js');
    const dash = new EditorialDashboardPage(page, app.contextPath);
    const out = {api: []};
    await dash.goto();
    const link = dash.viewLink('Published');
    out.viewOffered = (await link.count()) > 0;
    if (!out.viewOffered) {
        return out;
    }
    await link.first().click();
    await idle(page).catch(() => {});
    await pause(1_500);
    const row = dash.dataRows().filter({hasText: title}).first();
    out.rowFound = (await row.count()) > 0;
    if (!out.rowFound) {
        record(`published-view-${sid}`, await screen(page));
        return out;
    }
    const listen = (r) => {
        if (r.request().method() === 'GET' && new RegExp(`/api/v1/submissions/${sid}$`).test(new URL(r.url()).pathname)) {
            out.api.push(r.status());
        }
    };
    page.on('response', listen);
    try {
        await row.getByRole('button', {name: 'View', exact: true}).click();
        await settle(page);
    } finally {
        page.off('response', listen);
    }
    return out;
}

module.exports = {CASES, MODERATOR, flat, openByAddress, readWorkflow, limitByEdit, assignLimited, openFromPublished};
