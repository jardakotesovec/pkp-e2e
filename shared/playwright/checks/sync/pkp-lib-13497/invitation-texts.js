// Kept check of the PR review of pkp/pkp-lib#13497 (issue pkp/pkp-lib#12874, "Review invitation
// locale file"; the 3.5 twin is pkp/pkp-lib#13496), 2026-10-10. On PKP's default test dataset it
// reads every screen text the change touches, and whatever shows as an untranslated "##key##", so
// the same script run at the PR's base and at its head says what a person sees differently.
//
//   1. As `rvaca`: Settings > Users & Roles > "Invite to a role" for dbuskins@mailinator.com (a
//      member), a new Author role, "Save And Continue": the heading of step 3; "Invite user to the
//      role".
//   2. The invitation's row menu > "Edit": the question it asks. Dismissed.
//   3. "Invite to a role" again for an address nobody holds, given name "Nova", Author: sent.
//   4. The invitations API, for an added role without its user group: the refusal's text.
//   5. Signed out, the newcomer's emailed "Accept Invitation" link: each step's heading, description
//      and buttons; on "Create account" a username and password with the privacy box left
//      unticked, "Save and continue": the refusal. Then ticked, on to "Enter details" and the review.
//   6. As `rvaca`: Settings > Users & Roles > ORCID switched on (Member Sandbox, a made-up client).
//      Signed out, both emailed links again: the ORCID step's heading, description and buttons.
//
// Every page read also lists the "##key##" codes on screen and in the page's own data.
//
// Reset first:  npm run fleet-prep -- --feature sync-12874 --dataset 1 --reset
// Run (main):   PROBE_FEATURE=sync-12874 PROBE_AGENT=p12874 PROBE_RUN=<base|head> node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13497/invitation-texts.js
// 3.5:          prefix both with PKP_E2E_LINE=stable-3_5_0 (feature sync-12874-3_5)
const {forEachApp, launch, signIn, screen, record, serverLog, idle} = require('../../../probe');
const H = require('../../issues/invitation-wizard-typos/lib.js');
const O = require('../../issues/publish-without-issue-orcid-contributor-error/lib.js');

const T = 30_000;
const flat = H.flat;
const codes = (s) => [...new Set((s || '').match(/##[A-Za-z0-9_.]+##/g) || [])].sort();

/** One accept or send page as read: heading, description, buttons, and the "##" codes it holds. */
async function read(page) {
    await idle(page);
    const intro = await H.stepIntro(page);
    const main = await page.locator('main, body').first().innerText().catch(() => '');
    const buttons = await page.locator('main button:visible').evaluateAll((list) => list.map((b) => (b.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
    return {
        ...intro,
        steps: await page.locator('.pkpSteps ol li').evaluateAll((list) => list.map((li) => li.textContent.replace(/\s+/g, ' ').trim())),
        buttons: [...new Set(buttons)],
        codesOnScreen: codes(main),
        codesInAccessibleNames: codes(await page.locator('main, body').first().ariaSnapshot().catch(() => '')),
        codesInPageData: codes(await page.content()),
    };
}

/** "Invite user to the role" on step 3, then "View All Users". */
async function send(page) {
    await page.getByRole('button', {name: 'Invite user to the role'}).click();
    const sent = page.getByRole('dialog').filter({hasText: 'Invitation Sent'});
    await sent.waitFor({timeout: T});
    await sent.getByRole('button', {name: 'View All Users'}).click();
    await page.waitForURL(/management\/settings\/access/, {timeout: T}).catch(() => {});
    await idle(page);
}

forEachApp(async (app) => {
    const NEW = {email: `nova.p12874.${app.name}@mailinator.com`, username: `novap12874${app.name}`};
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset};
    const log = serverLog(app);
    const from = log.mark();
    const manager = await launch(app);
    const visitor = await launch(app);
    const page = manager.page;
    try {
        const since = new Date(Date.now() - 2000).toISOString();
        await signIn(page, 'rvaca', {contextPath: app.contextPath});

        // 1. a member, to step 3
        await H.usersAndRoles(page, app);
        await H.openInviteWizard(page);
        await H.searchUser(page, H.PERSON.email);
        await H.fillNewRole(page, {role: 'Author', masthead: 'Does not appear on the masthead'});
        await H.toCompose(page);
        facts.sendStep3 = await read(page);
        record('01-send-step-3', await screen(page));
        await send(page);

        // 2. the row's "Edit"
        const row = page.getByRole('table', {name: /Invitations \(/}).getByRole('row').filter({hasText: H.PERSON.email}).first();
        await row.waitFor({timeout: T});
        await row.getByRole('button').last().click();
        await page.getByRole('menuitem', {name: 'Edit'}).click();
        const dialog = page.getByRole('dialog').first();
        await dialog.waitFor({timeout: T});
        facts.editQuestion = {
            text: flat(await dialog.innerText()),
            buttons: await dialog.getByRole('button').evaluateAll((list) => list.map((b) => b.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)),
        };
        record('02-edit-question', await screen(page));
        await dialog.getByRole('button', {name: /^(Cancel|No|Go Back)$/}).first().click();
        await dialog.waitFor({state: 'detached', timeout: 10_000}).catch(() => {});

        // 3. a newcomer
        await H.usersAndRoles(page, app);
        await H.openInviteWizard(page);
        await H.searchUser(page, NEW.email);
        await page.getByLabel(/^Given Name/).first().fill('Nova');
        await H.fillNewRole(page, {role: 'Author', masthead: 'Does not appear on the masthead'});
        await H.toCompose(page);
        await send(page);

        // 4. the API's refusal of an added role without its user group
        facts.api = await page.evaluate(
            async ({base, email, day}) => {
                const headers = {'Content-Type': 'application/json', 'X-Csrf-Token': window.pkp.currentUser.csrfToken};
                const call = async (method, url, body) => {
                    const r = await fetch(base + url, {method, headers, body: body ? JSON.stringify(body) : undefined});
                    return {status: r.status, body: await r.json().catch(() => null)};
                };
                const added = await call('POST', '/add/userRoleAssignment', {invitationData: {inviteeEmail: email}});
                const id = added.body && added.body.invitationId;
                const populated = id ? await call('PUT', `/${id}/populate`, {invitationData: {userGroupsToAdd: [{dateStart: day, masthead: true}]}}) : null;
                return {add: added.status, invitationId: id || null, populate: populated};
            },
            {base: app.url(`/index.php/${app.contextPath}/api/v1/invitations`), email: `api.p12874.${app.name}@mailinator.com`, day: new Date().toISOString().slice(0, 10)}
        );

        // 5. the newcomer's link, signed out
        const v = visitor.page;
        const newcomer = await H.invitationMail(app, NEW.email, since);
        const member = await H.invitationMail(app, H.PERSON.email, since);
        await H.openAccept(v, newcomer.accept);
        facts.acceptAccount = await read(v);
        record('05-accept-account', await screen(v));
        await v.getByLabel(/^Username/).fill(NEW.username);
        await v.getByLabel(/^Password/).fill('p12874-Passw0rd');
        await v.getByRole('button', {name: 'Save and continue'}).click();
        await v.getByText(/Please confirm that you have read/).first().waitFor({timeout: 10_000}).catch(() => {});
        facts.privacyRefusal = (await v.locator('main, body').first().innerText()).split('\n').map((l) => l.trim()).filter((l) => /^Please confirm/.test(l));
        record('05-privacy-refusal', await screen(v));
        await v.getByRole('checkbox').first().check();
        await v.getByRole('button', {name: 'Save and continue'}).click();
        await v.getByLabel(/^Country of affiliation/).waitFor({timeout: T});
        facts.acceptDetails = await read(v);
        await v.getByLabel(/^Country of affiliation/).selectOption({index: 1});
        await v.getByRole('button', {name: 'Save and continue'}).click();
        await v.getByRole('button', {name: /^Accept And Continue/}).waitFor({timeout: T});
        facts.acceptReview = await read(v);
        record('05-accept-review', await screen(v));

        // 6. ORCID on, both links again
        facts.orcidSaved = (await O.setOrcidMember(page, app)).save;
        await H.openAccept(v, newcomer.accept);
        facts.orcidNewcomer = await read(v);
        record('06-orcid-newcomer', await screen(v));
        await H.openAccept(v, member.accept);
        facts.orcidMember = await read(v);
        record('06-orcid-member', await screen(v));

        facts.serverLog = log.since(from);
        record('texts', facts);
    } catch (error) {
        facts.error = String(error.stack || error).slice(0, 1500);
        facts.serverLog = log.since(from);
        record('texts', facts);
        throw error;
    } finally {
        await visitor.close();
        await manager.close();
    }
});
