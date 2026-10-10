// Kept check of the PR review of pkp/pkp-lib#13497 (issue pkp/pkp-lib#12874), 2026-10-10: the
// notice the accept page shows above the review step when the last press is refused. Its text,
// `invitation.wizard.errors`, is named by both wizards and defined in no locale file, before and
// after the PR (po-check.js lists it), so this reads what a person gets instead.
//
// On PKP's default test dataset, as `rvaca`: two people nobody knows are invited as Author. Signed
// out, each opens the emailed link and goes through "Create account" with the same username, then
// "Enter details", to the review. The first presses "Accept And Continue"; then the second does,
// and the username is taken by now. Recorded: the second page's notices and its "##" codes.
//
// Reset first:  npm run fleet-prep -- --feature sync-12874 --dataset 1 --reset
// Run:          PROBE_FEATURE=sync-12874 PROBE_AGENT=p12874 PROBE_RUN=<side> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13497/errors-notice.js
const {forEachApp, launch, signIn, screen, shot, record, idle} = require('../../../probe');
const H = require('../../issues/invitation-wizard-typos/lib.js');

const T = 30_000;
const codes = (s) => [...new Set((s || '').match(/##[A-Za-z0-9_.]+##/g) || [])].sort();

forEachApp(async (app) => {
    const people = ['una', 'duo'].map((n) => `${n}.p12874.${app.name}@mailinator.com`);
    const username = `twinp12874${app.name}`;
    const facts = {app: app.name, line: app.line || 'main', username};
    const manager = await launch(app);
    const visitors = [await launch(app), await launch(app)];
    try {
        const since = new Date(Date.now() - 2000).toISOString();
        await signIn(manager.page, 'rvaca', {contextPath: app.contextPath});
        for (const email of people) {
            await H.usersAndRoles(manager.page, app);
            await H.openInviteWizard(manager.page);
            await H.searchUser(manager.page, email);
            await manager.page.getByLabel(/^Given Name/).first().fill('Nova');
            await H.fillNewRole(manager.page, {role: 'Author', masthead: 'Does not appear on the masthead'});
            await H.toCompose(manager.page);
            await manager.page.getByRole('button', {name: 'Invite user to the role'}).click();
            const sent = manager.page.getByRole('dialog').filter({hasText: 'Invitation Sent'});
            await sent.waitFor({timeout: T});
            await sent.getByRole('button', {name: 'View All Users'}).click();
            await idle(manager.page);
        }
        for (const [i, email] of people.entries()) {
            const v = visitors[i].page;
            await H.openAccept(v, (await H.invitationMail(app, email, since)).accept);
            await v.getByLabel(/^Username/).fill(username);
            await v.getByLabel(/^Password/).fill('p12874-Passw0rd');
            await v.getByRole('checkbox').first().check();
            await v.getByRole('button', {name: 'Save and continue'}).click();
            await v.getByLabel(/^Country of affiliation/).waitFor({timeout: T});
            await v.getByLabel(/^Country of affiliation/).selectOption({index: 1});
            await v.getByRole('button', {name: 'Save and continue'}).click();
            await v.getByRole('button', {name: /^Accept And Continue/}).waitFor({timeout: T});
        }
        const [first, second] = visitors.map((x) => x.page);
        await first.getByRole('button', {name: /^Accept And Continue/}).click();
        await first.getByRole('dialog').first().waitFor({timeout: T});
        facts.firstAccepted = H.flat(await first.getByRole('dialog').first().innerText(), 200);
        const answer = second.waitForResponse((r) => /\/finalize/.test(r.url()), {timeout: T}).catch(() => null);
        await second.getByRole('button', {name: /^Accept And Continue/}).click();
        const r = await answer;
        facts.secondFinalize = r ? {status: r.status(), body: await r.json().catch(() => null)} : null;
        await idle(second);
        await second.waitForTimeout(1000);
        const main = await second.locator('main, body').first().innerText();
        facts.second = {
            heading: (await H.stepIntro(second)).heading,
            notices: await second.locator('[role="alert"], [role="status"], .pkpNotification').evaluateAll((list) => list.map((n) => n.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)),
            codesOnScreen: codes(main),
            linesWithCodes: main.split('\n').map((l) => l.trim()).filter((l) => /##/.test(l)),
        };
        record('errors-notice-screen', await screen(second));
        await shot(second, 'errors-notice').catch(() => {});
        record('errors-notice', facts);
    } catch (error) {
        facts.error = String(error.stack || error).slice(0, 1500);
        record('errors-notice', facts);
        throw error;
    } finally {
        for (const x of [...visitors, manager]) await x.close();
    }
});
