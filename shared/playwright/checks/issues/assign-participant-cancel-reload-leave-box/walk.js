// U35 A18 walk (issue report docs/issues/U35-A18-assign-participant-cancel-reload-leave-box.md).
// On PKP's default test dataset: dbarnes opens a submission (OJS 4, OMP 3, OPS 1) and, in the
// "Participants" panel's "Assign Participant" window:
//   A. chooses the section-editor role, "Search", Minoti Inoue, then "Author" without "Search", "OK"
//      (the form shows again, nobody assigned), "Cancel"; then reloads the page;
//   B. chooses the section-editor role without "Search", "Cancel"; then reloads the page;
//   C. (control) chooses the section-editor role, "Search", "Cancel"; then reloads the page.
// Each reload records the browser dialogs it raised, the forms the page's leave-page handler counted
// just before it, and the panel's rows after it.
// MODE=nb runs the neighbour check alone (for a fix trial): with the window open and a role chosen,
// the close control ("<") still asks, and a reload with the window still open still raises the box.
// MODE=ro reads the recommend-only box (pkp/pkp-lib#7894) as the person and the role change.
// MODE=leave takes path B, then leaves the page another way each time: a second reload, a link of
// the page's navigation, the browser's back, closing the tab.
//   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/assign-participant-cancel-reload-leave-box/walk.js
const {forEachApp, launch, signIn, signOut, record, screen, idle} = require('../../../probe');
const H = require('./lib.js');

const MODE = process.env.MODE || 'walk';

forEachApp(async (app) => {
    const c = H.CASES[app.name];
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, submissionId: c.id, storedBefore: H.stored(app, c.id)};
    const {page, close} = await launch(app);
    const dialogs = H.dialogLog(page);
    const step = async (name, fn) => {
        const t0 = Date.now();
        try {
            facts[name] = await fn();
        } catch (e) {
            facts[name] = {error: String(e.message || e).split('\n')[0]};
        }
        const d = dialogs.since(t0);
        if (d.length && facts[name] && !facts[name].dialogs) facts[name].dialogsDuring = d;
    };
    try {
        await signIn(page, 'dbarnes');
        const panel = await H.openWorkflow(page, app, c.id);
        facts.rowsBefore = await panel.rowLines();
        if (MODE === 'walk') {
            // A. the register entry's path
            await step('A', async () => {
                const out = {};
                const win = await panel.openAssign();
                await idle(page);
                await win.chooseRole(c.role);
                await win.search();
                await win.choosePerson(c.person);
                await win.chooseRole(c.otherRole);
                const saved = page.waitForResponse((r) => r.url().includes('save-participant'), {timeout: 30_000});
                await win.root.getByRole('button', {name: 'OK', exact: true}).click();
                const res = await saved;
                const body = await res.text().catch(() => '');
                out.okAnswer = {status: res.status(), redrawnForm: /<form/.test(body)};
                await page.waitForTimeout(1500);
                await idle(page);
                out.afterOk = {open: await win.roleSelect().isVisible().catch(() => false), role: await win.selectedRole().catch(() => null)};
                record('A-1-after-ok', await screen(page));
                out.unsavedAfterOk = await H.unsavedForms(page);
                await win.cancel();
                out.unsavedAfterCancel = await H.unsavedForms(page);
                record('A-2-after-cancel', await screen(page));
                out.storedAfter = H.stored(app, c.id);
                out.reload = await H.reload(page, panel, dialogs);
                return out;
            });
            // B. the role list changed without "Search", then "Cancel"
            await step('B', async () => {
                const out = {};
                const win = await panel.openAssign();
                await idle(page);
                await win.chooseRole(c.role);
                out.unsavedBeforeCancel = await H.unsavedForms(page);
                await win.cancel();
                out.unsavedAfterCancel = await H.unsavedForms(page);
                record('B-1-after-cancel', await screen(page));
                out.reload = await H.reload(page, panel, dialogs);
                return out;
            });
            // C. control: the role list and "Search", then "Cancel"
            await step('C', async () => {
                const out = {};
                const win = await panel.openAssign();
                await idle(page);
                await win.chooseRole(c.role);
                await win.search();
                await win.cancel();
                out.unsavedAfterCancel = await H.unsavedForms(page);
                record('C-1-after-cancel', await screen(page));
                out.reload = await H.reload(page, panel, dialogs);
                return out;
            });
        } else if (MODE === 'ro') {
            // The recommend-only box (pkp/pkp-lib#7894): shown for a person chosen under an editor role,
            // hidden under a role without it, shown again on the way back.
            await step('R', async () => {
                const out = {};
                const win = await panel.openAssign();
                await idle(page);
                const box = async () => ({
                    shown: await win.recommendOnlyBox().isVisible().catch(() => false),
                    checked: await win.recommendOnlyBox().isChecked().catch(() => null),
                    disabled: await win.recommendOnlyBox().isDisabled().catch(() => null),
                });
                await win.chooseRole(c.role);
                await win.search();
                out.roleSearched = await box();
                await win.choosePerson(c.person);
                out.editorChosen = await box();
                record('R-1-editor-chosen', await screen(page));
                await win.chooseRole(c.otherRole);
                await win.search();
                const authors = await win.peopleNames();
                out.otherRolePeople = authors.length;
                if (authors.length) {
                    await win.choosePerson(authors[0]);
                    out.otherRoleChosen = {person: authors[0], ...(await box())};
                }
                await win.chooseRole(c.role);
                await win.search();
                await win.choosePerson(c.person);
                out.editorAgain = await box();
                record('R-2-editor-again', await screen(page));
                await win.cancel();
                return out;
            });
        } else if (MODE === 'leave') {
            // Ways of leaving the page after path B ("Cancel" with the role list changed and no "Search"):
            // a second reload, a link of the page's own navigation, the browser's back, closing the tab.
            const pathB = async () => {
                const win = await panel.openAssign();
                await idle(page);
                await win.chooseRole(c.role);
                await win.cancel();
                return H.unsavedForms(page);
            };
            await step('L1', async () => {
                const out = {listed: await pathB()};
                out.firstReload = await H.reload(page, panel, dialogs);
                out.secondReload = await H.reload(page, panel, dialogs);
                return out;
            });
            await step('L2', async () => {
                const out = {listed: await pathB()};
                // The workflow is a window over the dashboard: close it (Escape), then follow a link of the
                // page's side navigation.
                await page.keyboard.press('Escape');
                await panel.heading().waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
                await idle(page);
                out.listedAfterWorkflowClosed = await H.unsavedForms(page);
                const link = page.locator('nav a[href]:visible:not([href*="dashboard"]):not([href="#"])').first();
                out.link = {text: (await link.innerText().catch(() => '')).trim(), href: await link.getAttribute('href').catch(() => null)};
                const t0 = Date.now();
                await link.click();
                await page.waitForLoadState('load').catch(() => {});
                await idle(page);
                out.dialogs = dialogs.since(t0);
                out.landed = page.url();
                return out;
            });
            await step('L3', async () => {
                await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${c.id}`));
                await panel.heading().waitFor({timeout: 60_000});
                await idle(page);
                const out = {listed: await pathB()};
                const t0 = Date.now();
                await page.goBack().catch((e) => (out.backError = String(e.message).split('\n')[0]));
                await page.waitForTimeout(1500);
                out.dialogs = dialogs.since(t0);
                out.landed = page.url();
                return out;
            });
            await step('L4', async () => {
                await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${c.id}`));
                await panel.heading().waitFor({timeout: 60_000});
                await idle(page);
                const out = {listed: await pathB()};
                facts.storedAfter = H.stored(app, c.id);
                const t0 = Date.now();
                await page.close({runBeforeUnload: true});
                await new Promise((r) => setTimeout(r, 1500));
                out.dialogs = dialogs.since(t0);
                return out;
            });
        } else {
            // Neighbour: the window's own form keeps asking while the window is open.
            await step('N', async () => {
                const out = {};
                const win = await panel.openAssign();
                await idle(page);
                await win.chooseRole(c.role);
                out.unsavedOpen = await H.unsavedForms(page);
                const t0 = Date.now();
                dialogs.answer.value = 'dismiss';
                await win.closeControl().click();
                await page.waitForTimeout(1000);
                out.closeControlDialogs = dialogs.since(t0);
                out.windowStillOpen = await win.roleSelect().isVisible().catch(() => false);
                record('N-1-close-control-kept', await screen(page));
                out.reloadWindowOpen = await H.reload(page, panel, dialogs);
                return out;
            });
        }
        if (!page.isClosed()) {
            facts.storedAfter = H.stored(app, c.id);
            await signOut(page);
        }
    } finally {
        record(MODE, facts);
        console.log(JSON.stringify(facts, null, 1));
        await close();
    }
});
