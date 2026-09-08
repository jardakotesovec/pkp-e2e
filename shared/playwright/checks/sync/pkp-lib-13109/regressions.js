// rr2 — reproduction of S1..S4 (.reports/sync/rr2/suspicions.md) for pkp/pkp-lib#13273.
// One OJS process on a scratch journal:
//   S1 manager makes an API key on her profile screen; a bare client GETs
//      /submissions/{id} and /_submissions with it (records s1-*)
//   S2 Statistics › Editorial Activity rows (s2-*)
//   S3 Settings › Users & Roles › Roles grid headers, toggles, Reviewer edit form (s3-*)
//   S4 workflow › Discussions › Add › Attach Files › Attach Workflow Files › stage select (s4-*)
//   PROBE_FEATURE=sync PROBE_AGENT=rr2 node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13109/regressions.js
const {request: pwRequest} = require('playwright');
const {forEachApp, launch, signIn, screen, shot, record, note, idle, settled, tag} =
    require('../../../probe');
const log = (...a) => console.log(...a);

async function snap(page, name) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
const visibleButtons = (page) => page.evaluate(() =>
    [...document.querySelectorAll('button, a[role=button], a.pkp_button')].filter((b) => b.offsetParent !== null)
        .map((b) => (b.getAttribute('aria-label') || b.innerText).trim()).filter(Boolean).slice(0, 120));

forEachApp(async (app) => {
    await app.api.bootstrapProbe(app.contextPath);
    const T = tag('rr2md');
    const mgr = `${T}mgr`, au = `${T}aut`;
    const ctx = await app.api.createContext({tag: T, users: [
        {username: mgr, roles: ['manager'], givenName: 'Meg', familyName: 'Rrtwo'},
        {username: au, roles: ['author'], givenName: 'Au', familyName: 'Thor'},
    ]});
    const sub = await app.api.createSubmission({tag: T, context: T, submitter: au, title: `RR2 ${T}`});
    record('seed', {ctx, sub});
    const sid = sub.submissionId;
    const mgrId = ctx.users.find((u) => u.username === mgr).id;
    log('seeded', T, 'submission', sid, 'manager', mgrId);

    const {page, close} = await launch(app);
    try {
        await signIn(page, mgr, {contextPath: T});

        // ---------- S4: workflow › Discussions › Add › Attach Files › Attach Workflow Files ----------
        await page.goto(app.url(`/index.php/${T}/dashboard/editorial?workflowSubmissionId=${sid}`));
        await idle(page);
        const wf = page.getByRole('dialog').filter({hasText: /Discussion/i}).first();
        await wf.waitFor({state: 'visible', timeout: 30_000}).catch(() => {});
        record('s4-workflow-buttons', await visibleButtons(page));
        const addBtn = page.getByRole('button', {name: 'Add', exact: true}).first();
        await addBtn.waitFor({state: 'visible', timeout: 20_000});
        await addBtn.click();
        await idle(page);
        const pick = page.getByRole('menuitem', {name: /Discussion/i}).first();
        if (await pick.isVisible().catch(() => false)) { await pick.click(); await idle(page); }
        await snap(page, 's4-add-discussion');
        record('s4-add-buttons', await visibleButtons(page));
        const attach = page.locator('.tox-tbtn').filter({hasText: /Attach Files/i}).first();
        await attach.waitFor({state: 'visible', timeout: 20_000});
        await attach.click();
        await idle(page);
        await snap(page, 's4-attachers');
        record('s4-attacher-buttons', await visibleButtons(page));
        const wfFiles = page.getByRole('button', {name: /Attach Workflow Files/i}).first();
        await wfFiles.waitFor({state: 'visible', timeout: 20_000});
        await wfFiles.click();
        await idle(page);
        const sel = page.locator('[role=dialog]:visible').filter({hasText: /Select submission stage/i}).locator('select').last();
        await sel.waitFor({state: 'visible', timeout: 20_000});
        const options = await sel.locator('option').evaluateAll((os) => os.map((o) => ({value: o.value, text: o.textContent.trim(), disabled: o.disabled})));
        record('s4-stage-options', options);
        log('S4 stage options', JSON.stringify(options));
        await snap(page, 's4-stage-select');
        note(`rr2 [ojs]: Discussions › "Add Discussion" form's TinyMCE "Attach Files" opens the attacher window; "Attach Workflow Files" shows a native <select> "Select submission stage" (${options.length} options).`);
    } finally {
        await close();
    }
});
