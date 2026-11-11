// Helpers of walk.js (U34 A13: "Move to Done", "Return to Workflow" and "Return to Done" typed into the
// decision page's address; docs/issues/U34-A13-decision-address-done-decisions-blank-page.md).
// Requiring this file runs nothing. typed() is adapted from
// ../revert-decline-typed-on-undeclined-submission/lib.js, openWorkflow() and pressDecision() from
// ../internal-round-revised-files-not-carried/lib.js (copied, not required).
const {idle, screen} = require('../../../probe');

const flat = (s, n = 300) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** Open the submission's workflow from the editorial dashboard's address, as the dashboard's list does. */
async function openWorkflow(page, app, id) {
    await page.goto('about:blank');
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${Number(id)}`));
    await idle(page);
    await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30_000}).catch(() => {});
    await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15_000}).catch(() => {});
    await idle(page);
    await page.waitForTimeout(400);
}

/** The decision buttons the open workflow offers. */
const offered = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const root = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
    const actions = root.querySelector('[data-cy="workflow-action-items"]');
    return actions ? [...actions.querySelectorAll('button, a')].filter(vis).map((b) => b.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean) : null;
});

/** Press the workflow's decision button `name` (a string or RegExp) and wait for the decision page; returns its address. */
async function pressDecision(page, name) {
    const dlg = page.locator('[role="dialog"]:visible').first();
    const btn = dlg.locator('[data-cy="workflow-action-items"]').getByRole('button', typeof name === 'string' ? {name, exact: true} : {name}).first();
    await btn.waitFor({state: 'visible', timeout: 10_000}).catch(() => {});
    if (!(await btn.count())) return {absent: true, offered: await offered(page)};
    const label = flat(await btn.innerText(), 80);
    await btn.click();
    await page.waitForURL(/decision\/record/, {timeout: 20_000}).catch(() => {});
    await idle(page).catch(() => {});
    return {label, url: page.url().replace(/^https?:\/\/[^/]+/, ''), onPage: /decision\/record/.test(page.url()), h1: flat(await page.locator('h1').first().innerText({timeout: 5000}).catch(() => null), 120)};
}

/** Open the decision page's address as a person types it; returns status, address, title, heading, body text and whether the wizard is on screen. */
async function typed(page, app, id, decision, base = null) {
    // base: the address a decision button opened; the person changes its submission number and decision only.
    const path = base
        ? base.replace(/\/decision\/record\/\d+/, `/decision/record/${Number(id)}`).replace(/([?&])decision=\d+/, `$1decision=${decision}`)
        : `/index.php/${app.contextPath}/decision/record/${Number(id)}?decision=${decision}`;
    const resp = await page.goto(app.url(path));
    await idle(page).catch(() => {});
    await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
    const s = await screen(page).catch((e) => ({error: flat(e.message)}));
    const body = await page.locator('body').innerText().catch(() => null);
    const html = await page.content().catch(() => '');
    return {
        typed: path,
        status: resp ? resp.status() : null,
        url: page.url().replace(/^https?:\/\/[^/]+/, ''),
        title: await page.title().catch(() => null),
        h1: flat(await page.locator('h1').first().innerText({timeout: 2000}).catch(() => null), 160),
        bodyText: flat(body, 400),
        htmlLength: html.length,
        wizard: await page.getByRole('button', {name: 'Record Decision', exact: true}).first().isVisible().catch(() => false)
            || await page.locator('.decision__footer, .pkpSteps').first().isVisible().catch(() => false),
        screen: s,
    };
}

module.exports = {flat, typed, openWorkflow, offered, pressDecision};
