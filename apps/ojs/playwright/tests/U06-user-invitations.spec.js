// @ts-check
/**
 * @file playwright/tests/U06-user-invitations.spec.js
 *
 * User invitations — OJS suite, one test per canonical scenario the spec runs
 * on OJS (scenarios 1–8 and 10; scenario 9 is OPS-only).
 * Spec: docs/specs/U06-user-invitations.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 ❓,
 * A2 ❓, A3 🐞, A4 🐞, A5 🐞, A6 🐞, A7 🐞, A8 🐞. Where a test passes
 * through one (S2/S3/S8 sign in afresh after accepting, S6 reads a replaced
 * link as "not opening the flow") it asserts the effect the spec states and
 * leaves the finding's own claim unasserted either way.
 * The spec's Coverage section records everything else left out.
 *
 * Every test seeds its own scratch journal (publicknowledge and the seeded
 * roster stay untouched); Mailpit assertions are scoped by unique throwaway
 * recipient addresses carrying app + test in the tag, plus a subject marker.
 * "Today" is computed in the process's zone; the suite runs with TZ=UTC, the
 * PHP servers' clock (the start date the wizard stamps is compared to it).
 */
const {test, expect} = require('../support/fixtures.js');
const {
    UsersRolesPage,
    SendInvitationWizard,
    AcceptInvitationWizard,
} = require('../pages/UserInvitationPages.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');

const ROLE = 'Copyeditor'; // offered role under test (assistant-level, masthead selectable)
const ORCID_ID = 'https://sandbox.orcid.org/0000-0002-1825-0097'; // fn-s, the sandbox example
const MASTHEAD_SUBJECT = 'Your journal masthead visibility has been updated';
const ROLE_ENDED_SUBJECT = 'You have been removed from a role';

/** Unique per-run tag: alphanumeric, carries app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u6${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** YYYY-MM-DD in the process's zone (input[type=date] format; TZ=UTC). */
function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Scratch journal + throwaway manager (+ optional extra users, + optional
 * further context keys such as `orcid`). Seeded users get email
 * `<username>@mail.test`, password username-doubled.
 */
async function seedJournal(ojsApi, tag, extraUsers = [], contextKeys = {}) {
    const manager = `mgr${tag}`;
    await ojsApi.createContext({
        tag,
        ...contextKeys,
        users: [{username: manager, roles: ['manager']}, ...extraUsers],
    });
    return {path: tag, manager};
}

/**
 * Drive the send wizard from Users & Roles as the (already signed-in) manager
 * page. `search` is the step-1 input; pass `expectExisting` for a roster hit.
 * Returns the "Enter details" step's text and the compose step's body as
 * shown at send time.
 */
async function sendInvitation(managerPage, contextPath, {search, expectExisting = false, givenName, subject}) {
    const usersRoles = new UsersRolesPage(managerPage, contextPath);
    await usersRoles.goto();
    await usersRoles.inviteButton.click();

    const wizard = new SendInvitationWizard(managerPage);
    await wizard.searchAndContinue(search);
    if (expectExisting) {
        await expect(managerPage.getByText('The user already exists in the journal')).toBeVisible();
    } else {
        await expect(managerPage.getByText('The user does not have a role in this journal')).toBeVisible();
        if (givenName) {
            await wizard.fillGivenName(givenName);
        }
    }
    const detailsText = await wizard.readDetailsStep();
    await wizard.fillRoleRow({role: ROLE, startDate: today()});
    await wizard.saveAndContinue();
    await wizard.setSubject(subject);
    const body = await wizard.readBody();
    await wizard.send();
    await wizard.dismissSentDialog();
    return {wizard, detailsText, body};
}

/**
 * Fetch the invitation email (scoped by recipient + subject marker) and pull
 * both links, the sender and the plain-text body. The email template uses
 * single-quoted hrefs, so we regex the URL directly rather than via
 * extractLink (which assumes double quotes).
 */
async function invitationLinks(pkpMail, {to, contains}) {
    const summary = await pkpMail.find({to, contains});
    const full = await pkpMail.fullMessage(summary.ID);
    const html = full.HTML;
    const grab = (op) => {
        const m = html.match(new RegExp(`href=['"]([^'"]*/invitation/${op}\\?[^'"]+)['"]`, 'i'));
        return m ? m[1].replace(/&amp;/g, '&') : null;
    };
    return {
        html,
        text: full.Text,
        subject: full.Subject,
        from: full.From,
        accept: grab('accept'),
        decline: grab('decline'),
    };
}

/**
 * The lines of a compose-step body that carry no template variable
 * ("{$RECIPIENTNAME}" is substituted on send), whitespace-collapsed, for
 * comparison with the sent email's text.
 */
function fixedLines(body) {
    return body
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length > 20 && !line.includes('{$'));
}

test.describe('user invitations', () => {
    test('S1: manager invites a newcomer to a role', {tag: '@smoke'}, async ({page, asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const recipient = `rcpt${tag}@mail.test`;
        const subject = `Invitation${tag}`;
        const {path, manager} = await seedJournal(ojsApi, tag);

        const managerCtx = await asUser(manager);
        const managerPage = await managerCtx.newPage();
        const first = await sendInvitation(managerPage, path, {search: recipient, givenName: 'Nova', subject});

        // Back on Users & Roles the Invitations table shows the pending row.
        const usersRoles = new UsersRolesPage(managerPage, path);
        await usersRoles.goto();
        await expect(usersRoles.invitationsHeading(1)).toBeVisible();
        const row = usersRoles.invitationRow(recipient);
        await expect(row).toBeVisible();
        await expect(row).toContainText('Invited');
        await expect(row).toContainText(ROLE);

        // The recipient's mailbox holds the invitation, sent from the Journal
        // Manager, listing the offered role with its start date and masthead
        // visibility and the accept and decline links (Side effects).
        const links = await invitationLinks(pkpMail, {to: recipient, contains: subject});
        expect(links.from.Address).toBe(`${manager}@mail.test`);
        const mailText = links.text.replace(/\s+/g, ' ');
        expect(mailText).toContain('Newly assigned roles');
        expect(mailText).toContain(ROLE);
        expect(mailText).toContain(`Starting from ${today()}`);
        expect(mailText).toMatch(new RegExp(`masthead as an? ${ROLE}`));
        expect(links.accept).toContain('/invitation/accept');
        expect(links.decline).toContain('/invitation/decline');

        // The subject is the marker typed on the compose step and the body the
        // text that step showed at send time (its variables substituted).
        expect(links.subject).toBe(subject);
        const lines = fixedLines(first.body);
        expect(lines.length).toBeGreaterThanOrEqual(3);
        for (const line of lines) {
            expect(mailText).toContain(line);
        }

        // A second send to the same address: the wizard gives no hint that a
        // pending invitation exists (the "Enter details" step reads exactly as
        // on the first walk), and afterwards the Invitations table holds only
        // the newer row (Rule 3). The second email bounds the table read.
        const second = await sendInvitation(managerPage, path, {search: recipient, givenName: 'Nova', subject});
        expect(second.detailsText).toBe(first.detailsText);
        await expect.poll(() => pkpMail.count({to: recipient, contains: subject})).toBe(2);
        await usersRoles.goto();
        await expect(usersRoles.invitationsHeading(1)).toBeVisible();
        await expect(usersRoles.invitationRow(recipient)).toHaveCount(1);

        // Control: under Current Users the address has no row, the manager's
        // own row bounding the list read (Rule 9).
        await expect(usersRoles.userRow(`${manager}@mail.test`)).toBeVisible();
        await expect(usersRoles.usersTable).not.toContainText(recipient);
    });

    test('S2: newcomer accepts and gets an account', {tag: '@smoke'}, async ({page, asUser, browser, baseURL, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const recipient = `rcpt${tag}@mail.test`;
        const subject = `Invitation${tag}`;
        const username = `acc${tag}`;
        const password = `Password${tag}`;
        const {path, manager} = await seedJournal(ojsApi, tag);

        const managerCtx = await asUser(manager);
        const managerPage = await managerCtx.newPage();
        await sendInvitation(managerPage, path, {search: recipient, givenName: 'Nova', subject});
        const links = await invitationLinks(pkpMail, {to: recipient, contains: subject});

        // Signed out, the accept link opens the wizard on "Create OJS account"
        // with no "Verify ORCID iD" step, ORCID being off on this journal
        // (Rule 5; the rail's own "Create OJS account" pill is the control).
        await page.goto(links.accept);
        const wizard = new AcceptInvitationWizard(page);
        await wizard.expectOnAccountStep();
        await expect(wizard.stepPill('Create OJS account')).toBeVisible();
        await expect(wizard.stepPill('Verify ORCID iD')).toHaveCount(0);
        await expect(page.getByText('Verify ORCID iD')).toHaveCount(0);

        // The Password field states its minimum (six characters on a default
        // install); Pass5 is refused inline and the step does not advance
        // (Settings). The accepted password below is the control.
        await expect(wizard.passwordHint).toHaveText(/at least 6 characters long/);
        await wizard.submitAccount({username, password: 'Pass5'});
        await expect(wizard.fieldError('The password must be at least 6 characters.')).toBeVisible();
        await wizard.expectOnAccountStep();
        await expect(wizard.stepHeading(/Enter details/)).toHaveCount(0);

        // The consent checkbox's label links to the journal's Privacy
        // Statement page (Settings).
        await expect(wizard.privacyStatementLink).toHaveAttribute('href', new RegExp(`/${path}/about/privacy$`));

        await wizard.createAccount({username, password});
        await wizard.fillDetails({givenName: 'Nova', country: 'CA'});
        await wizard.expectOnReviewStep();
        await expect(page.getByText(username)).toBeVisible();

        // The review step's Edit button reopens the details, then back.
        await page.getByRole('button', {name: 'Edit', exact: true}).click();
        await expect(page.getByLabel(/^Country of affiliation/)).toBeVisible();
        await wizard.saveAndContinueButton.click();
        await wizard.expectOnReviewStep();

        await wizard.accept();

        // Spec behavior around A4: the new credentials work via a fresh sign-in.
        const freshCtx = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
        const loginPage = new LoginPage(await freshCtx.newPage());
        await loginPage.goto();
        await loginPage.signIn(username, password);
        await freshCtx.close();

        // Control: the invitation's row is gone from the manager's Invitations
        // table, beside the account now holding the role (Rule 11).
        const usersRoles = new UsersRolesPage(managerPage, path);
        await usersRoles.goto();
        await expect(usersRoles.invitationsHeading(0)).toBeVisible();
        await expect(usersRoles.invitationRow(recipient)).toHaveCount(0);
        const userRow = usersRoles.userRow(recipient);
        await expect(userRow).toBeVisible();
        await expect(userRow).toContainText(ROLE);
    });

    test('S3: existing user accepts an additional role', async ({page, asUser, browser, baseURL, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const invitee = `ex${tag}`;
        const inviteeEmail = `${invitee}@mail.test`;
        const subject = `Invitation${tag}`;
        const {path, manager} = await seedJournal(ojsApi, tag, [{username: invitee, roles: ['author']}]);

        const managerCtx = await asUser(manager);
        const managerPage = await managerCtx.newPage();
        await sendInvitation(managerPage, path, {search: inviteeEmail, expectExisting: true, subject});

        // The recipient's mailbox: the email lists the offered role and, as a
        // role already held, Author (Side effects).
        const links = await invitationLinks(pkpMail, {to: inviteeEmail, contains: subject});
        const mailText = links.text.replace(/\s+/g, ' ');
        expect(mailText).toMatch(/Already assigned roles.*Author/);
        expect(mailText).toMatch(new RegExp(`Newly assigned roles.*${ROLE}`));

        // Signed out, the review step opens directly: no password prompt, no
        // account fields (Rule 6; ORCID off per Rule 5).
        await page.goto(links.accept);
        const wizard = new AcceptInvitationWizard(page);
        await wizard.expectOnReviewStep();
        await expect(wizard.passwordInput).toHaveCount(0);
        await expect(wizard.usernameInput).toHaveCount(0);

        // The link opened, the accept button not pressed: the manager's row
        // still reads "Invited {date}" (Rule 5).
        const usersRoles = new UsersRolesPage(managerPage, path);
        await usersRoles.goto();
        await expect(usersRoles.invitationsHeading(1)).toBeVisible();
        await expect(usersRoles.invitationRow(inviteeEmail)).toContainText('Invited');

        await wizard.accept();

        // Signing in the usual way works (spec behavior around A4)...
        const freshCtx = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
        const loginPage = new LoginPage(await freshCtx.newPage());
        await loginPage.goto();
        await loginPage.signIn(invitee, invitee + invitee);
        await freshCtx.close();

        // ...and the manager sees the role on the account under Current Users.
        // Control: the invitation's row is gone (Rule 11), where it still stood
        // before the accept button was pressed.
        await usersRoles.goto();
        await expect(usersRoles.invitationsHeading(0)).toBeVisible();
        await expect(usersRoles.invitationRow(inviteeEmail)).toHaveCount(0);
        const userRow = usersRoles.userRow(inviteeEmail);
        await expect(userRow).toBeVisible();
        await expect(userRow).toContainText(ROLE);
    });

    test('S4: recipient declines', async ({page, asUser, ojsApi, pkpMail}, testInfo) => {
        const tag = makeTag('s4', testInfo);
        const recipient = `rcpt${tag}@mail.test`;
        const subject = `Invitation${tag}`;
        const {path, manager} = await seedJournal(ojsApi, tag);

        const managerCtx = await asUser(manager);
        const managerPage = await managerCtx.newPage();
        await sendInvitation(managerPage, path, {search: recipient, givenName: 'Nova', subject});
        const links = await invitationLinks(pkpMail, {to: recipient, contains: subject});

        // The decline link asks for confirmation; only the button declines (Rule 10).
        await page.goto(links.decline);
        await expect(page.getByRole('heading', {name: 'Decline Invitation'})).toBeVisible();
        await expect(page.getByText('Are you sure you want to decline this invitation?')).toBeVisible();

        // The page open, not yet confirmed: the manager's row still reads
        // "Invited {date}" (Rule 10).
        const usersRoles = new UsersRolesPage(managerPage, path);
        await usersRoles.goto();
        await expect(usersRoles.invitationsHeading(1)).toBeVisible();
        await expect(usersRoles.invitationRow(recipient)).toContainText('Invited');

        await page.getByRole('button', {name: 'Confirm Decline Invitation'}).click();
        await page.waitForURL(/\/login/, {waitUntil: 'commit'});

        // No role granted, row gone: the manager row bounds the users list read.
        await usersRoles.goto();
        await expect(usersRoles.invitationsHeading(0)).toBeVisible();
        await expect(usersRoles.invitationRow(recipient)).toHaveCount(0);
        await expect(usersRoles.userRow(`${manager}@mail.test`)).toBeVisible();
        await expect(usersRoles.usersTable).not.toContainText(recipient);

        // Control: both emailed links now land on "Invitation Unavailable" (Rule 4).
        await page.goto(links.accept);
        await expect(page.getByRole('heading', {name: 'Invitation Unavailable'})).toBeVisible();
        await page.goto(links.decline);
        await expect(page.getByRole('heading', {name: 'Invitation Unavailable'})).toBeVisible();
    });

    test('S5: manager cancels a pending invitation', async ({page, asUser, ojsApi, pkpMail}, testInfo) => {
        const tag = makeTag('s5', testInfo);
        const recipient = `rcpt${tag}@mail.test`;
        const subject = `Invitation${tag}`;
        const {path, manager} = await seedJournal(ojsApi, tag);

        const managerCtx = await asUser(manager);
        const managerPage = await managerCtx.newPage();
        await sendInvitation(managerPage, path, {search: recipient, givenName: 'Nova', subject});
        const links = await invitationLinks(pkpMail, {to: recipient, contains: subject});

        const usersRoles = new UsersRolesPage(managerPage, path);
        await usersRoles.goto();
        const row = usersRoles.invitationRow(recipient);
        await expect(row).toBeVisible();
        await usersRoles.rowAction(row, 'Cancel Invite');

        // The confirmation recaps the invitee (email, role, status; Rule 16).
        const dialog = managerPage.getByRole('dialog').filter({hasText: 'Cancel Invitation'});
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(recipient);
        await expect(dialog).toContainText(ROLE);
        await expect(dialog).toContainText('Invited');
        await dialog.getByRole('button', {name: 'Cancel Invitation', exact: true}).click();

        // The row disappears; the accept link shows "Invitation Unavailable"
        // with Login and Register (Rules 4, 16).
        await expect(usersRoles.invitationsHeading(0)).toBeVisible();
        await expect(usersRoles.invitationRow(recipient)).toHaveCount(0);
        await page.goto(links.accept);
        const unavailable = page.getByRole('heading', {name: 'Invitation Unavailable'});
        await expect(unavailable).toBeVisible();
        await expect(page.getByRole('link', {name: 'Login', exact: true})).toBeVisible();
        await expect(page.getByRole('link', {name: 'Register', exact: true})).toBeVisible();

        // Control: the same accept link with its end cut off shows a not-found
        // error, never the "Invitation Unavailable" page just read (Rule 4).
        const truncated = await page.goto(links.accept.slice(0, -3));
        expect(truncated && truncated.status()).toBe(404);
        await expect(page.getByRole('heading', {name: '404 Not Found'})).toBeVisible();
        await expect(unavailable).toHaveCount(0);
    });

    test('S6: manager edits a pending invitation (edit = replace)', async ({page, asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const recipient = `rcpt${tag}@mail.test`;
        const firstMarker = `${tag}first`;
        const secondMarker = `${tag}second`;
        const {path, manager} = await seedJournal(ojsApi, tag);

        const managerCtx = await asUser(manager);
        const managerPage = await managerCtx.newPage();
        await sendInvitation(managerPage, path, {search: recipient, givenName: 'Nova', subject: firstMarker});
        const firstLinks = await invitationLinks(pkpMail, {to: recipient, contains: firstMarker});

        const usersRoles = new UsersRolesPage(managerPage, path);
        await usersRoles.goto();
        await usersRoles.rowAction(usersRoles.invitationRow(recipient), 'Edit');

        // The warning dialog announces cancel-and-resend (Rule 12).
        const dialog = managerPage.getByRole('dialog').filter({hasText: 'Edit Invitation'});
        await expect(dialog).toContainText('the current invitation will be canceled');
        await dialog.getByRole('button', {name: 'Edit Invitation'}).click();

        // The wizard reopens prefilled, without the search step.
        const wizard = new SendInvitationWizard(managerPage);
        await expect(wizard.stepHeading(/STEP 1 - Enter details/)).toBeVisible();
        await expect(wizard.stepPill('Enter details')).toBeVisible();
        await expect(wizard.stepPill('Search User')).toHaveCount(0);
        await expect(wizard.emailInput).toHaveValue(recipient);

        // Change the role set and send the replacement (the prefilled row is a
        // "Select a new role" row — the newcomer has no current groups).
        await wizard.fillRoleRow({role: 'Author', startDate: today()});
        await wizard.saveAndContinue();
        await wizard.setSubject(secondMarker);
        await wizard.send();
        await wizard.dismissSentDialog();

        // The second email's links work (positive control)...
        const secondLinks = await invitationLinks(pkpMail, {to: recipient, contains: secondMarker});
        await page.goto(secondLinks.accept);
        const acceptWizard = new AcceptInvitationWizard(page);
        await acceptWizard.expectOnAccountStep();

        // ...while the first email's links no longer open the flow (Rule 12;
        // the exact error rendering is register A3, not asserted).
        await page.goto(firstLinks.accept);
        await expect(acceptWizard.stepHeading(/Create OJS account/)).toHaveCount(0);
        await expect(acceptWizard.acceptButton).toHaveCount(0);
    });

    test('S7: wrong person signed in is refused until they log out', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        const tag = makeTag('s7', testInfo);
        const invitee = `ex${tag}`;
        const inviteeEmail = `${invitee}@mail.test`;
        const subject = `Invitation${tag}`;
        const {path, manager} = await seedJournal(ojsApi, tag, [{username: invitee, roles: ['author']}]);

        const managerCtx = await asUser(manager);
        const managerPage = await managerCtx.newPage();
        await sendInvitation(managerPage, path, {search: inviteeEmail, expectExisting: true, subject});
        const links = await invitationLinks(pkpMail, {to: inviteeEmail, contains: subject});

        // The signed-in manager (not the invitee) opens the accept link: refusal.
        await managerPage.goto(links.accept);
        const refusal = managerPage.getByRole('dialog').filter({hasText: 'logged in as a different user'});
        await expect(refusal).toContainText('Invitation not accepted');

        // Control: "Logout" genuinely ends the session (Rule 6)...
        await refusal.getByRole('button', {name: 'Logout'}).click();
        await expect(managerPage.locator('form#login')).toBeVisible();

        // ...and reopening the link starts the real flow (review step, no
        // password prompt, no account fields).
        await managerPage.goto(links.accept);
        const wizard = new AcceptInvitationWizard(managerPage);
        await wizard.expectOnReviewStep();
        await expect(wizard.passwordInput).toHaveCount(0);
    });

    test('S8: manager proposes a role via the user row', async ({page, asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        const member = `ex${tag}`;
        const memberEmail = `${member}@mail.test`;
        const subject = `Invitation${tag}`;
        const {path, manager} = await seedJournal(ojsApi, tag, [{username: member, roles: ['author', 'reader']}]);

        const managerCtx = await asUser(manager);
        const managerPage = await managerCtx.newPage();
        const usersRoles = new UsersRolesPage(managerPage, path);
        await usersRoles.goto();
        await usersRoles.rowAction(usersRoles.userRow(memberEmail), /^Edit$/);

        // The wizard opens on the member's details with no search step; the
        // roles table shows the current roles with Remove Role and masthead
        // controls (Rule 13).
        const wizard = new SendInvitationWizard(managerPage);
        await expect(wizard.stepHeading(/STEP 1 - Enter details/)).toBeVisible();
        await expect(wizard.stepPill('Enter details')).toBeVisible();
        await expect(wizard.stepPill('Search User')).toHaveCount(0);
        await expect(managerPage.getByText(memberEmail).first()).toBeVisible();
        const authorRow = wizard.currentRoleRow('Author');
        const readerRow = wizard.currentRoleRow('Reader');
        await expect(wizard.removeRoleButton(authorRow)).toBeVisible();
        await expect(wizard.removeRoleButton(readerRow)).toBeVisible();
        await expect(wizard.mastheadSelect(authorRow)).toHaveValue('true');
        await expect(wizard.mastheadSelect(readerRow)).toHaveValue('true');

        // The masthead control on the Author row: pick the other value; the
        // confirmation says the member will be notified; confirm: the change
        // takes effect at once and the member's mailbox holds the masthead
        // email (Rule 13, Side effects).
        await wizard.mastheadSelect(authorRow).selectOption({label: 'Does not appear on the masthead'});
        await expect(wizard.mastheadDialog).toBeVisible();
        await expect(wizard.mastheadDialog).toContainText('The user will be notified of this change.');
        const mastheadSaved = managerPage.waitForResponse((r) => r.url().includes('/masthead/'));
        await wizard.mastheadDialog.getByRole('button', {name: 'Confirm'}).click();
        expect((await mastheadSaved).status()).toBe(200);
        await expect(wizard.mastheadDialog).toBeHidden();
        await expect(wizard.mastheadSelect(authorRow)).toHaveValue('false');
        await pkpMail.find({to: memberEmail, subject: MASTHEAD_SUBJECT});

        // Remove Role on the Reader row: the confirmation asks "Are you sure
        // you want to remove this role? …" and says nothing of an email;
        // confirm with "Remove Role": the row stays in the roles table with
        // its End Date set to today and "User Removed From Role" in place of
        // its button, and the member's mailbox holds the removal email
        // (Rule 13, Side effects). The Author row's button is the control.
        await wizard.removeRoleButton(readerRow).click();
        await expect(wizard.removeRoleDialog).toBeVisible();
        await expect(wizard.removeRoleDialog).toContainText(
            'Are you sure you want to remove this role? The user will lose access and permissions associated with it.'
        );
        await expect(wizard.removeRoleDialog).not.toContainText(/notified|email/i);
        const roleEnded = managerPage.waitForResponse((r) => r.url().includes('/endRole/'));
        await wizard.removeRoleDialog.getByRole('button', {name: 'Remove Role'}).click();
        expect((await roleEnded).status()).toBe(200);
        await expect(wizard.removeRoleDialog).toBeHidden();
        await expect(readerRow).toHaveCount(1);
        await expect(readerRow.getByRole('cell')).toContainText(['Reader', today(), today(), /Journal Masthead/, 'User Removed From Role']);
        await expect(wizard.removeRoleButton(readerRow)).toHaveCount(0);
        await expect(wizard.removeRoleButton(authorRow)).toBeVisible();
        await pkpMail.find({to: memberEmail, subject: ROLE_ENDED_SUBJECT});

        // Remove Role on the Author row, now the last active role: no
        // confirmation opens; a "Remove Role" dialog answers "You cannot
        // remove the role. …" with a single "Close" button; after "Close" the
        // row keeps its Remove Role button and masthead select (Rule 13; the
        // Reader removal above is the control).
        await wizard.removeRoleButton(authorRow).click();
        await expect(wizard.removeRoleDialog).toBeVisible();
        await expect(wizard.removeRoleDialog).toContainText(
            'You cannot remove the role. At least one role must be assigned to the user.'
        );
        await expect(wizard.removeRoleDialog).not.toContainText('Are you sure');
        await expect(wizard.removeRoleDialog.getByRole('button')).toHaveText(['Close']);
        await wizard.removeRoleDialog.getByRole('button', {name: 'Close'}).click();
        await expect(wizard.removeRoleDialog).toBeHidden();
        await expect(wizard.removeRoleButton(authorRow)).toBeVisible();
        await expect(wizard.mastheadSelect(authorRow)).toHaveValue('false');

        // "Save And Continue" on the details step stays inactive until a new
        // role row is added; an empty row activates it, and pressing it
        // rejects the missing role fields with inline errors (Rule 13).
        await expect(wizard.saveAndContinueButton).toBeDisabled();
        await wizard.addAnotherRoleButton.click();
        await expect(wizard.saveAndContinueButton).toBeEnabled();
        await wizard.saveAndContinueButton.click();
        const newRow = wizard.newRoleRow();
        await expect(wizard.requiredErrors(newRow)).toHaveCount(3);
        await expect(wizard.stepHeading(/STEP 1 - Enter details/)).toBeVisible();

        // The filled row: fill it in and send: the member receives an
        // invitation email.
        await wizard.fillRoleRow({role: ROLE, startDate: today()});
        await wizard.saveAndContinue();
        await wizard.setSubject(subject);
        await wizard.send();
        await wizard.dismissSentDialog();

        // The member is emailed, but the added role is only a proposal: not on
        // the account yet (the visible row bounds the list read).
        const links = await invitationLinks(pkpMail, {to: memberEmail, contains: subject});
        await usersRoles.goto();
        await expect(usersRoles.invitationsHeading(1)).toBeVisible();
        const memberRow = usersRoles.userRow(memberEmail);
        await expect(memberRow).toBeVisible();
        await expect(memberRow).not.toContainText(ROLE);

        // The member accepts (scenario 3's flow) — only then the role lands.
        await page.goto(links.accept);
        const acceptWizard = new AcceptInvitationWizard(page);
        await acceptWizard.expectOnReviewStep();
        await acceptWizard.accept();

        await usersRoles.goto();
        await expect(usersRoles.invitationsHeading(0)).toBeVisible();
        await expect(usersRoles.userRow(memberEmail)).toContainText(ROLE);

        // Control: the removal and the masthead change took effect at once,
        // read back on the reopened wizard (Rule 13).
        await usersRoles.rowAction(usersRoles.userRow(memberEmail), /^Edit$/);
        await expect(wizard.stepHeading(/STEP 1 - Enter details/)).toBeVisible();
        await expect(wizard.removeRoleButton(wizard.currentRoleRow(ROLE))).toBeVisible();
        await expect(wizard.mastheadSelect(wizard.currentRoleRow('Author'))).toHaveValue('false');
        await expect(wizard.removeRoleButton(wizard.currentRoleRow('Reader'))).toHaveCount(0);
    });

    test('S10: the ORCID step shows only to a recipient without a verified iD', async ({page, asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        const recipient = `rcpt${tag}@mail.test`;
        const invitee = `ex${tag}`;
        const inviteeEmail = `${invitee}@mail.test`;
        const subject = `Invitation${tag}`;
        const {path, manager} = await seedJournal(
            ojsApi,
            tag,
            [{username: invitee, roles: ['author'], orcid: ORCID_ID, orcidIsVerified: true}],
            {orcid: {}}
        );

        const managerCtx = await asUser(manager);
        const managerPage = await managerCtx.newPage();

        // A newcomer's invitation, as in scenario 1.
        await sendInvitation(managerPage, path, {search: recipient, givenName: 'Nova', subject});
        const newcomerLinks = await invitationLinks(pkpMail, {to: recipient, contains: subject});

        // The newcomer's accept link, signed out: the wizard opens on "Verify
        // ORCID iD", offering "Verify ORCID iD" and "Skip ORCID verification"
        // and no other Continue button (Rules 5, 7). "Verify ORCID iD" stays
        // unpressed (ORCID's sign-in never completes on a test install).
        await page.goto(newcomerLinks.accept);
        const wizard = new AcceptInvitationWizard(page);
        await wizard.expectOnOrcidStep();
        await expect(wizard.stepPill('Verify ORCID iD')).toBeVisible();
        await expect(wizard.verifyOrcidButton).toBeVisible();
        await expect(wizard.skipOrcidButton).toBeVisible();
        await expect(wizard.saveAndContinueButton).toHaveCount(0);
        await expect(page.getByRole('button', {name: /continue/i})).toHaveCount(0);

        // "Skip ORCID verification": "Create OJS account" opens (Rule 5), with
        // its own "Save and continue" (the control for the step above).
        await wizard.skipOrcid();
        await wizard.expectOnAccountStep();
        await expect(wizard.saveAndContinueButton).toBeVisible();

        // The verified user's invitation, as in scenario 3.
        await sendInvitation(managerPage, path, {search: inviteeEmail, expectExisting: true, subject});
        const userLinks = await invitationLinks(pkpMail, {to: inviteeEmail, contains: subject});

        // Control: that accept link, signed out, opens the review step directly
        // with no "Verify ORCID iD" step (Rule 5).
        await page.goto(userLinks.accept);
        await wizard.expectOnReviewStep();
        await expect(wizard.stepPill('Review & create account')).toBeVisible();
        await expect(wizard.stepPill('Verify ORCID iD')).toHaveCount(0);
        await expect(page.getByText('Verify ORCID iD')).toHaveCount(0);
        await expect(wizard.acceptButton).toBeVisible();
    });
});
