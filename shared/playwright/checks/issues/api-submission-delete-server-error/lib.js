// Helpers for walk.js (U22 A8). Runs nothing when required. send() types the report's console requests
// (GET and DELETE {context}/api/v1/submissions/{id}) as the browser console would; workflowVersionLabels()
// reads the workflow's side menu for the neighbour check.
const {idle, screen} = require('../../../probe');

// Required inside forEachApp's fn, so PKP_APP_ROOT is the app's (patterns.md "Probe kit").
const dashboard = (page, ctx) => new (require('../../../pages/EditorialDashboardPage.js').EditorialDashboardPage)(page, ctx);

/** The editorial dashboard ("Submissions"), the page the Steps type their requests on. */
async function openDashboard(page, ctx) {
    await dashboard(page, ctx).goto();
    await idle(page);
}

/** The console request of the Steps, from the page open now: its status and, for a record, the fields
 * the report compares (each publication's version label and contributors). */
async function send(page, method, id) {
    return await page.evaluate(async ({m, sid}) => {
        /* global pkp */
        const res = await fetch(`${pkp.context.apiBaseUrl}submissions/${sid}`, {
            method: m, headers: m === 'GET' ? {} : {'X-Csrf-Token': pkp.currentUser.csrfToken},
        });
        const text = await res.text();
        let body = null;
        try { body = JSON.parse(text); } catch (e) { /* not JSON */ }
        const record = body && body.id ? {
            id: body.id,
            status: body.status,
            publications: (body.publications || []).map((p) => ({
                id: p.id, status: p.status, versionString: p.versionString, authorsString: p.authorsString,
            })),
        } : null;
        return {method: m, url: `submissions/${sid}`, status: res.status, record, body: record ? undefined : text.slice(0, 400)};
    }, {m: method, sid: id});
}

/** The workflow of a submission, opened by its address: the side menu's version entries. */
async function workflowVersionLabels(page, ctx, id) {
    const d = dashboard(page, ctx);
    await page.goto(d.url(`?workflowSubmissionId=${id}`));
    await idle(page);
    const dialog = page.getByRole('dialog').first();
    await dialog.waitFor({timeout: 30_000}).catch(() => {});
    await page.waitForTimeout(1500);
    const s = await screen(page);
    const lines = String(s.text.dialog || '').split('\n').map((l) => l.trim())
        .filter((l) => /Unassigned version|Version of Record|Original|Accepted|Submitted|\b\d+\.\d+\b/.test(l) && l.length < 120);
    return {labels: [...new Set(lines)]};
}

module.exports = {openDashboard, send, workflowVersionLabels};
