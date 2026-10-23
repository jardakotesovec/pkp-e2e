// U27 claim check I23A (housekeeping 2026-10-23): the incidentals row on Add Reviewer ›
// "Enroll Existing User" › "Search By Name" when nothing matches. U27 control table, row
// "Search By Name" (user autocomplete).
//
// On PKP's default test dataset, as `dbarnes` (the Editor), on a submission in Review
// (OJS 12, OMP 2):
//   W1  type a string no user has, read the autocomplete's answer (JSON), pick "No Matches"
//       if offered, read the hidden user id, press "Add Reviewer": status, body, screen 5 s
//       on (spinner, button state, message), the server log lines; reload and read the
//       Reviewers panel.
//   W2  the other end of "no match": an existing reviewer's family name (excluded by the
//       autocomplete), same reads.
//   W3  type a non-matching string, leave the box without picking, press "Add Reviewer"
//       (the field's own refusal), then the control: a real non-reviewer picked and
//       submitted (r1/s1 Maria Fritz, r2/s2 Sarah Vogt: one per run, since an enrolled
//       user is excluded afterwards); row read at once and after a reload.
//   W4  leave the enroll form with a typed name unsaved by the header "Close": dialogs.
// OPS (no review stage): read-only control that the workflow has no Reviewers panel.
//
// Self-contained: no other script, no state file. Each run under its own PROBE_RUN.
// Main (dataset fleet 6 of feature issues-cc23d):
//   PROBE_RUN=r1 PROBE_FEATURE=issues-cc23d PKP_E2E_DATASET=6 PROBE_NOTES_FEATURE=U27 \
//     PROBE_AGENT=cc23d node bin/probe.js ojs shared/playwright/checks/U27/I23A/i23a.js
//   (omp, ops the same; r2 for the second run; reset the fleet first:
//    npm run fleet-prep -- --feature issues-cc23d --dataset 6 --reset)
// stable-3_5_0: PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-cc23d-3_5 PKP_E2E_DATASET=6,
//   PROBE_RUN=s1 / s2.
const {forEachApp, launch, signIn, screen, record, shot, loc, note, idle, serverLog} = require('../../../probe');
const L = require('../../issues/reviewer-template-chooser-nothing-to-choose/lib.js');

const RUN = process.env.PROBE_RUN || 'r1';
const SUB = {ojs: 12, omp: 2};
const NOMATCH = 'Zqxwvu';
const REVIEWER = 'Janssen'; // jjanssen: Reviewer (OJS), Internal Reviewer (OMP)
const CONTROL = /[r|s]2$/.test(RUN) ? {search: 'Vogt', person: 'Sarah Vogt'} : {search: 'Fritz', person: 'Maria Fritz'};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

async function openEnroll(page) {
    const {ReviewerRequestWindow} = require('../../../pages/ReviewerSuggestionPages.js');
    await page.getByRole('button', {name: 'Add Reviewer', exact: true}).first().click();
    const win = new ReviewerRequestWindow(page);
    await win.dialog().waitFor({timeout: 30_000});
    await idle(page);
    const link = win.dialog().locator('a, button').filter({hasText: /^\s*Enroll Existing User\s*$/}).first();
    await link.waitFor({timeout: 30_000});
    await link.click();
    await win.enrollHeading().waitFor({timeout: 30_000});
    await win.expectOpen();
    return win;
}

/** Type into "Search By Name", wait for the autocomplete's answer and the menu. */
async function typeSearch(page, win, text, answers) {
    const before = answers.length;
    await win.searchByName().click();
    await win.searchByName().pressSequentially(text, {delay: 80});
    for (let i = 0; i < 40 && answers.length === before; i++) await sleep(250);
    await sleep(600);
    const items = await page.locator('ul.ui-autocomplete:visible li').allInnerTexts().catch(() => []);
    return {answer: answers.slice(before), menu: items.map((t) => flat(t, 200))};
}

async function fieldState(win) {
    return win.dialog().locator('#enrollExistingReviewerForm').evaluate((f) => {
        const hid = f.querySelector('input[type=hidden][name="userId"]');
        const txt = f.querySelector('input[id^="userId_input"]');
        return {hiddenUserId: hid ? hid.value : '(none)', text: txt ? txt.value : '(none)'};
    }).catch((e) => ({error: String(e.message).slice(0, 200)}));
}

/** Press "Add Reviewer" and read the answer, then the window 5 s on. */
async function submitAndRead(page, app, win, name, {expectRequest = true} = {}) {
    const log = serverLog(app), from = log.mark();
    const out = {};
    let resp = null;
    try {
        if (expectRequest) {
            resp = await win.submit();
        } else {
            // the field's own (browser-side) refusal sends nothing: wait briefly for any POST
            await win.settled();
            const answered = page
                .waitForResponse((r) => /\/reviewer-grid\//.test(r.url()) && r.request().method() === 'POST', {timeout: 4_000})
                .catch(() => null);
            await win.addReviewerButton().click();
            resp = await answered;
            out.requestSent = !!resp;
        }
    } catch (e) {
        out.submitError = String(e.message).slice(0, 300);
    }
    if (resp) {
        out.url = resp.url().replace(/^https?:\/\/[^/]+/, '');
        out.status = resp.status();
        out.body = flat(await resp.text().catch(() => ''), 900);
    }
    await sleep(5_000);
    const d = win.dialog();
    out.windowOpen = await d.isVisible().catch(() => false);
    if (out.windowOpen) {
        out.spinnerBesideButton = await d.locator('.formButtons .pkp_spinner:visible, .pkp_form .buttons .pkp_spinner:visible').count().catch(() => null);
        out.spinnerVisible = await d.locator('.pkp_spinner:visible').count().catch(() => null);
        out.addButtonDisabled = await win.addReviewerButton().isDisabled().catch(() => null);
        out.fieldErrors = await d.locator('label.error:visible, .error:visible, .pkp_form_error:visible').allInnerTexts().catch(() => []);
        out.inPlaceNotice = flat(await d.locator('#enrollExistingReviewerFormNotification, [id^="enrollExistingReviewerFormNotification"]').first().innerText().catch(() => null));
        out.field = await fieldState(win);
    }
    out.serverLog = log.since(from).map((l) => flat(l, 400));
    const s = await screen(page);
    out.notices = s.notices;
    record(`i23a-${name}`, s);
    await shot(page, `i23a-${name}`);
    return out;
}

async function rows(modal) {
    return flat(await modal.locator('[data-cy="reviewer-manager"]').innerText().catch(() => null), 1500);
}

forEachApp(async (app) => {
    const facts = {app: app.name, line: app.line || 'main', run: RUN};
    const {page, close} = await launch(app);
    const answers = [];
    page.on('response', async (r) => {
        if (/get-users-not-assigned-as-reviewers/.test(r.url())) {
            answers.push({url: r.url().replace(/^https?:\/\/[^/]+/, ''), status: r.status(), body: flat(await r.text().catch(() => ''), 900)});
        }
    });
    const dialogs = [];
    page.on('dialog', async (dl) => {
        dialogs.push({type: dl.type(), message: dl.message()});
        await dl.accept().catch(() => {});
    });
    try {
        await signIn(page, 'dbarnes');
        if (!SUB[app.name]) {
            // OPS: no review stage; the workflow of a submission in Production
            await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=1`));
            // the active-modal wrapper reads as hidden on OPS: wait for the stage heading instead
            const modal = page.locator('[data-cy="active-modal"]').first();
            await page.getByRole('heading', {name: /^Workflow:/i}).first().waitFor({timeout: 30_000});
            await idle(page);
            await sleep(1500);
            const s = await screen(page);
            record(`i23a-ops-control`, s);
            await shot(page, `i23a-ops-control`);
            facts.reviewerManager = await page.locator('[data-cy="reviewer-manager"]').count();
            facts.addReviewerButtons = await page.getByRole('button', {name: 'Add Reviewer', exact: true}).count();
            facts.reviewMenuEntries = await modal.getByText(/Review/).allInnerTexts().catch(() => []);
            facts.workflowMenu = flat(await modal.locator('nav, [class*="SideMenu"], [class*="sideMenu"]').first().innerText().catch(() => null), 600);
            return;
        }
        const id = SUB[app.name];
        facts.submission = id;
        let modal = await L.openWorkflow(page, app, id);
        facts.stage = await L.stageHeading(modal);
        facts.rowsBefore = await rows(modal);

        for (const [w, text] of [['w1', NOMATCH], ['w2', REVIEWER]]) {
            const f = (facts[w] = {typed: text});
            const win = await openEnroll(page);
            if (w === 'w1') {
                record(`i23a-enroll-open`, await screen(page));
                await shot(page, `i23a-enroll-open`);
                await loc(page, 'Enroll: Search By Name text box', win.searchByName());
                await loc(page, 'Enroll: reviewer role select', win.userGroupSelect());
                f.roleOptions = await win.userGroupSelect().evaluate((s) => [...s.options].map((o) => o.text.trim())).catch(() => null);
                f.links = await win.dialog().locator('#enrollExistingReviewerForm .action_links a').allInnerTexts().catch(() => []);
            }
            const t = await typeSearch(page, win, text, answers);
            f.autocomplete = t.answer;
            f.menu = t.menu;
            record(`i23a-${w}-menu`, await screen(page));
            await shot(page, `i23a-${w}-menu`);
            const entry = page.locator('ul.ui-autocomplete:visible li').filter({hasText: 'No Matches'}).first();
            f.noMatchesOffered = (await entry.count()) > 0;
            if (f.noMatchesOffered) {
                await loc(page, 'Enroll autocomplete: "No Matches" entry', entry);
                await entry.click();
                await idle(page);
                f.afterPick = await fieldState(win);
                // leave the box, as a person moving on to the button does
                await page.keyboard.press('Tab');
                await sleep(300);
                f.afterBlur = await fieldState(win);
                f.submit = await submitAndRead(page, app, win, `${w}-submitted`);
            } else {
                f.submit = 'no "No Matches" entry to pick';
            }
            modal = await L.openWorkflow(page, app, id);
            f.rowsAfterReload = await rows(modal);
        }

        // W3: typed, not picked, then the control
        {
            const f = (facts.w3 = {});
            const win = await openEnroll(page);
            const t = await typeSearch(page, win, NOMATCH, answers);
            f.menu = t.menu;
            await page.keyboard.press('Escape').catch(() => {});
            await win.dialog().getByText('Reviewer Role', {exact: false}).first().click().catch(() => {});
            await page.keyboard.press('Tab');
            await sleep(400);
            f.afterLeaveUnpicked = await fieldState(win);
            f.unpickedSubmit = await submitAndRead(page, app, win, 'w3-unpicked-submitted', {expectRequest: false});
            f.control = CONTROL;
            const c = await typeSearch(page, win, CONTROL.search, answers);
            f.controlAutocomplete = c.answer;
            f.controlMenu = c.menu;
            const pick = page.locator('ul.ui-autocomplete:visible li').filter({hasText: CONTROL.person}).first();
            if ((await pick.count()) > 0) {
                await pick.click();
                await idle(page);
                f.controlPicked = await fieldState(win);
                // the unpicked submit's "This field is required." after the pick (U27 A14, retired)
                f.messagesAfterPick = await win.dialog().locator('label.error:visible, .error:visible').allInnerTexts().catch(() => []);
                record(`i23a-w3-control-picked`, await screen(page));
                f.controlSubmit = await submitAndRead(page, app, win, 'w3-control-submitted');
                f.rowsAfterControl = await rows(modal);
                modal = await L.openWorkflow(page, app, id);
                f.rowsAfterControlReload = await rows(modal);
                record(`i23a-w3-control-reloaded`, await screen(page));
            } else {
                f.controlSubmit = 'control user not offered';
            }
        }

        // W4: leave with a typed, unsaved name
        {
            const f = (facts.w4 = {});
            const win = await openEnroll(page);
            await win.searchByName().click();
            await win.searchByName().pressSequentially('Gallego', {delay: 60});
            await sleep(1500);
            const d0 = dialogs.length;
            await win.closeButton().click().catch((e) => (f.closeError = String(e.message).slice(0, 200)));
            await sleep(2000);
            f.dialogsOnClose = dialogs.slice(d0);
            f.windowsLeft = await page.getByRole('dialog', {name: /Add Reviewer/i}).count();
            record(`i23a-w4-closed`, await screen(page));
        }
    } catch (e) {
        facts.error = String(e && e.stack).slice(0, 900);
        await shot(page, `i23a-error`).catch(() => {});
    } finally {
        facts.dialogs = dialogs;
        record(`i23a-facts`, facts);
        await close();
    }
});
