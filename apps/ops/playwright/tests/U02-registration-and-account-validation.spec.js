// @ts-check
/**
 * @file playwright/tests/U02-registration-and-account-validation.spec.js
 *
 * U2 — Registration & account validation, OPS suite. One test per canonical
 * scenario of docs/specs/U02-registration-and-account-validation.md, in OPS
 * vocabulary (preprint server, Server Manager, Moderators; no reviewer role
 * at all). Scenario 3 is {OJS OMP} — a preprint server installs no reviewer
 * role, so it costs one absence test with a positive control per assertion
 * (RUNBOOK multi-app rule 3, spec Rule 7). Scenario 7 runs against the
 * fleet's fixed validation-variant server (`variants.validation`: email
 * validation and the ALTCHA spam check on, same database), reached by
 * explicit navigation; the ALTCHA widget verifies in the browser as a user
 * would see it, and the wait is on the browser's own POST carrying the
 * widget's field. Every registration uses a throwaway account; the seeded
 * server's settings are never touched (settings changes happen on scratch
 * servers), and Mailpit reads are scoped by a unique throwaway recipient
 * (PRINCIPLES A8).
 *
 * Deliberately NOT covered here (and why):
 * - Scenario 3's reviewer registration itself ({OJS OMP}): no reviewer role
 *   exists on a preprint server; only the absence is asserted (Rule 7).
 * - OPS1 (🐞: the site-level page asks for reviewing interests on a server
 *   site with no reviewer role): a finding, never asserted as contract
 *   (PRINCIPLES M3); scenario 6 leaves that box alone.
 * - A3 (🐞: the site-level notification opt-in records nothing), A4 (🐞:
 *   closed servers listed with nothing to tick), A2 (🐞: headless activation
 *   pages, no Login link after activating), A6 (🐞: registration with
 *   validation required and no technical support contact ends on an empty
 *   page), A1 (🐞: activation-link lifetime ignores validation_timeout):
 *   findings, never asserted; scenario 7's server sets its support contact
 *   first, and the emailed link is used well inside its lifetime.
 * - A5 (❓: the Register page's "Login" link drops its Roles-tab
 *   destination) and A7 (❓: Reader granted while closed to
 *   self-registration): parked on the register; a claim parked on an open ❓
 *   is not a coverage gap (M3).
 * - Rule 9's interrupted-destination continuation, Rule 3 (registration on
 *   a sign-in-restricted server), Rule 2's disabled-server and all-closed
 *   site states: no canonical scenario exercises them; the all-closed state
 *   would touch the seeded server's settings (A1 of PRINCIPLES).
 * - Rule 14's expired link and the monthly cleanup (Side effects): clock-
 *   and scheduler-gated; Rule 16 (name copied into the site language): the
 *   spec itself says no scenario exercises it.
 * - reCAPTCHA: needs Google's service, unreachable behind the dead-port
 *   proxy (harness.md); the JavaScript-off ALTCHA refusal is a browser
 *   configuration, not a screen.
 */
const {test, expect} = require('../support/fixtures.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {getEmail} = require('../../../../shared/playwright/data/users.js');
const {disableMotion} = require('../../../../shared/playwright/support/motion.js');
const {
    RegisterPage,
    RegistrationCompletePage,
    ProfileRolesTab,
    ServerSettingsPages,
} = require('../pages/RegistrationPages.js');

const APP = 'ops';
const PK = 'publicknowledge';
const PK_NAME = 'Public Knowledge Preprint Server';
const COUNTRY = 'Iceland';
const ERRORS_HEADING = 'Errors occurred processing this form:';
const USERNAME_TAKEN = 'The selected username is already in use by another user.';
const EMAIL_TAKEN = 'The selected email address is already in use by another user.';
const PASSWORDS_DIFFER = 'The passwords do not match.';
const PASSWORD_SHORT = 'The password must be at least 6 characters.';
const CONSENT_REQUIRED = 'You must agree to the terms of the privacy statement.';
const CONSENT_LABEL = 'Yes, I agree to have my data collected and stored according to the privacy statement.';
const CONTEXT_CONSENT_LABEL =
    "Yes, I agree to have my data collected and stored according to this server's privacy statement.";
const EMAIL_OPTIN_LABEL = 'Yes, I would like to be notified of new publications and announcements.';
const REVIEWER_OPTIN_TEXT = 'Yes, I would like to be contacted with requests to review';
const CLOSED_MESSAGE = 'This server is currently not accepting user registrations.';
const CONTEXTS_PROMPT = 'Which servers on this site would you like to register with?';
const ROLES_PROMPT = 'Request the following roles.';
const PENDING_TITLE = 'Registration awaiting verification';
const pendingSentence = (email) =>
    `We've sent a confirmation email to you at ${email}. Please follow the instructions in that email to activate your new account. If you do not see an email, please check to see if it was put in your spam folder.`;
const DISABLED_PREFIX = 'Your account has been disabled for the following reason: ';
const ACTIVATE_DESCRIPTION = 'Confirm and activate your account';
const ACTIVATED =
    'Thank you for activating your account. You may now log in using the credentials you supplied when you created your account.';
const VALIDATE_SUBJECT = 'Validate Your Account';
const INVITATION_UNAVAILABLE = 'Invitation Unavailable';

/** Single hyphenless alphanumeric token — tag conventions in patterns.md. */
function makeTag(prefix) {
    return prefix + Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 7);
}

/** A throwaway registrant: username, email (names app + test) and password. */
function makeRegistrant(tag, suffix = '') {
    const username = `${tag}${suffix}`;
    return {
        username,
        email: `${username}-${APP}@mail.test`,
        password: `Pw${username}x`,
        givenName: `Given${username}`,
        familyName: 'Registrant',
        affiliation: 'Test University',
    };
}

/** The signed-out / signed-in user menu in the site header. */
function userNav(page) {
    return page.locator('#navigationUser');
}

/** Fill the whole "Profile" + "Login" part of the form for a registrant. */
async function fillRegistrant(register, r) {
    await register.fill({
        givenName: r.givenName,
        familyName: r.familyName,
        affiliation: r.affiliation,
        country: COUNTRY,
        email: r.email,
        username: r.username,
        password: r.password,
        password2: r.password,
    });
}

/** A fresh signed-out browser context (never inherits any storage state). */
async function newVisitor(browser, baseURL) {
    const context = await browser.newContext({
        baseURL,
        storageState: {cookies: [], origins: []},
    });
    await disableMotion(context);
    return context;
}

/**
 * Sign in through a given server's Login form on an arbitrary base URL
 * (the validation variant included). Returns once the form has answered:
 * either the browser left /login, or the page re-rendered with a message.
 */
async function signInAt(page, base, contextPath, username, password) {
    const login = new LoginPage(page);
    await page.goto(`${base}/index.php/${contextPath}/login`);
    await login.usernameInput.fill(username);
    await login.fillPassword(password);
    const answered = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/login/signIn')
    );
    await login.submitButton.click();
    await answered;
}

test.describe('registration & account validation (U2) — OPS', () => {
    test('scenario 1: register with the server and land on the completion page', async ({page}) => {
        const r = makeRegistrant(makeTag('u02s1'));
        const register = new RegisterPage(page);

        // From the server homepage, the header's "Register" (Rule 1).
        await page.goto(`/index.php/${PK}`);
        await userNav(page).getByRole('link', {name: 'Register', exact: true}).click();
        await expect(register.heading).toBeVisible();
        await expect(page.getByText('Required fields are marked with an asterisk: *')).toBeVisible();

        await fillRegistrant(register, r);
        await register.privacyConsentBox.check();
        await register.submit();

        // "Registration complete" with the three server-level links and no
        // "View Submissions" (Rules 9, 10).
        const complete = new RegistrationCompletePage(page);
        await complete.expectShown();
        await complete.expectActions(['Make a New Submission', 'Edit My Profile', 'Continue Browsing']);

        // Signed in: the header shows the new username where "Register" and
        // "Login" were.
        await expect(userNav(page)).toContainText(r.username);
        await expect(userNav(page).getByRole('link', {name: 'Register', exact: true})).toHaveCount(0);
        await expect(userNav(page).getByRole('link', {name: 'Login', exact: true})).toHaveCount(0);

        // "Edit My Profile" › Roles: "Reader" ticked and nothing else (Rule 7).
        await complete.editProfileLink.click();
        const roles = new ProfileRolesTab(page);
        await roles.tab.click();
        await expect(roles.ownBox('Reader')).toBeChecked();
        await expect(roles.ownBox('Author')).not.toBeChecked();
        expect(await roles.ownContextBoxes.evaluateAll((els) => els.filter((el) => el.checked).length)).toBe(1);
    });

    test('scenario 2: the form refuses bad input', async ({page}) => {
        const r = makeRegistrant(makeTag('u02s2'));
        const register = new RegisterPage(page);
        await register.goto(PK);
        await expect(register.heading).toBeVisible();

        // A taken username typed with a capital, that account's email in
        // capitals, a short password and a different repeat (Rule 15).
        await fillRegistrant(register, r);
        await register.fill({
            username: 'Reader.Rosa',
            email: getEmail('reader.rosa').toUpperCase(),
            password: 'abc',
            password2: 'xyz',
        });
        await register.privacyConsentBox.check();
        await register.submit();

        await expect(register.errorBox).toContainText(ERRORS_HEADING);
        await expect(register.errorLines).toHaveText([USERNAME_TAKEN, PASSWORDS_DIFFER, EMAIL_TAKEN]);
        await expect(register.usernameInput).toHaveValue('Reader.Rosa');
        await expect(register.passwordInput).toHaveValue('');
        await expect(register.password2Input).toHaveValue('');

        // A fresh username and email with a password below the site minimum.
        await register.fill({username: r.username, email: r.email, password: 'abc', password2: 'abc'});
        await register.privacyConsentBox.check();
        await register.submit();
        await expect(register.errorLines).toHaveText([PASSWORD_SHORT]);
    });

    test('scenario 3 {OJS OMP}: the server\'s Register offers no reviewer box (absence)', async ({page}) => {
        const register = new RegisterPage(page);
        await register.goto(PK);
        await expect(register.heading).toBeVisible();

        // Control: the boxes that sit beside the reviewer offer on a journal
        // are here — the notification opt-in and the privacy consent.
        await expect(register.emailConsentBox).toBeVisible();
        await expect(page.getByText(EMAIL_OPTIN_LABEL)).toBeVisible();
        await expect(register.privacyConsentBox).toBeVisible();

        // Absence: no reviewer checkbox, no reviewer prompt, no "Reviewing
        // interests" box (Rule 7: a preprint server installs no reviewer role).
        await expect(register.reviewerBoxes).toHaveCount(0);
        await expect(register.reviewerFieldset).toHaveCount(0);
        await expect(page.getByText(REVIEWER_OPTIN_TEXT)).toHaveCount(0);
        await expect(page.getByText('Reviewing interests')).toHaveCount(0);
        await expect(register.reviewerInterestsInput).toHaveCount(0);
    });

    test('scenario 4: privacy consent is required when a statement exists', async ({page, context, browser, baseURL, opsApi, asUser}) => {
        test.slow();
        const tag = makeTag('u02s4');
        const manager = `m${tag}`;
        await opsApi.createContext({tag, users: [{username: manager, roles: ['manager']}]});
        const first = makeRegistrant(tag, 'a');
        const second = makeRegistrant(tag, 'b');

        const register = new RegisterPage(page);
        await register.goto(tag);
        await expect(register.heading).toBeVisible();

        // The consent box is present; "privacy statement" opens the server's
        // Privacy Statement page in a new tab (Rule 5).
        await expect(register.privacyConsentBox).toBeVisible();
        await expect(page.getByText(CONSENT_LABEL)).toBeVisible();
        const [statementTab] = await Promise.all([
            context.waitForEvent('page'),
            register.privacyStatementLink.click(),
        ]);
        await expect(statementTab.getByRole('heading', {name: 'Privacy Statement'})).toBeVisible();
        await statementTab.close();

        // A valid form with the box unticked is refused with one line.
        await fillRegistrant(register, first);
        await register.submit();
        await expect(register.errorLines).toHaveText([CONSENT_REQUIRED]);

        // Ticked, with the passwords retyped: "Registration complete".
        await register.privacyConsentBox.check();
        await register.fill({password: first.password, password2: first.password});
        await register.submit();
        await new RegistrationCompletePage(page).expectShown();

        // The Server Manager empties the statement and saves.
        const managerPage = await (await asUser(manager)).newPage();
        await new ServerSettingsPages(managerPage, tag).clearPrivacyStatement();

        // A signed-out visitor: no consent box (control: the notification
        // box beside it is still there), and the form registers without it.
        const visitor = await newVisitor(browser, baseURL);
        try {
            const visitorPage = await visitor.newPage();
            const register2 = new RegisterPage(visitorPage);
            await register2.goto(tag);
            await expect(register2.heading).toBeVisible();
            await expect(register2.emailConsentBox).toBeVisible();
            await expect(register2.privacyConsentBox).toHaveCount(0);
            await expect(visitorPage.getByText(CONSENT_LABEL)).toHaveCount(0);

            await fillRegistrant(register2, second);
            await register2.submit();
            await new RegistrationCompletePage(visitorPage).expectShown();
        } finally {
            await visitor.close();
        }
    });

    test('scenario 5: closed registration', async ({page, opsApi, asUser}) => {
        test.slow();
        const tag = makeTag('u02s5');
        const manager = `m${tag}`;
        await opsApi.createContext({tag, users: [{username: manager, roles: ['manager']}]});

        // The Server Manager closes registration on Site Access Options.
        const managerPage = await (await asUser(manager)).newPage();
        await new ServerSettingsPages(managerPage, tag).closeRegistration();

        // The server's header offers "Login" (control) and no "Register".
        await page.goto(`/index.php/${tag}`);
        await expect(userNav(page).getByRole('link', {name: 'Login', exact: true})).toBeVisible();
        await expect(userNav(page).getByRole('link', {name: 'Register', exact: true})).toHaveCount(0);

        // The Login page: form and "Forgot your password?" (control), no
        // "Register" link below the form.
        await page.goto(`/index.php/${tag}/login`);
        const login = new LoginPage(page);
        await expect(login.usernameInput).toBeVisible();
        await expect(page.getByRole('main').getByRole('link', {name: 'Forgot your password?'})).toBeVisible();
        await expect(page.getByRole('main').getByRole('link', {name: 'Register', exact: true})).toHaveCount(0);

        // The typed Register address: title "Register", the closed message,
        // a "Login" link, no form (Rule 2).
        const register = new RegisterPage(page);
        await register.goto(tag);
        await expect(register.heading).toBeVisible();
        await expect(page.getByText(CLOSED_MESSAGE)).toBeVisible();
        await expect(page.getByRole('main').getByRole('link', {name: 'Login', exact: true})).toBeVisible();
        await expect(register.form).toHaveCount(0);

        // The site homepage's "Register" still opens the site-level page,
        // because the seeded server is open.
        await page.goto('/index.php/index');
        await userNav(page).getByRole('link', {name: 'Register', exact: true}).click();
        await expect(register.heading).toBeVisible();
        await expect(register.form).toBeVisible();
        await expect(register.contextsLegend).toHaveText(CONTEXTS_PROMPT);
        await expect(register.readerBox(PK_NAME)).toBeVisible();
    });

    test('scenario 6: register from the site homepage with roles in two servers', async ({page, opsApi}) => {
        test.slow();
        const tag = makeTag('u02s6');
        const scratchName = `Scratch server ${tag}`;
        await opsApi.createContext({tag, context: {name: scratchName}});
        const r = makeRegistrant(tag);

        // The site homepage (the server list) → header "Register" (Rule 1).
        await page.goto('/index.php/index');
        await userNav(page).getByRole('link', {name: 'Register', exact: true}).click();
        const register = new RegisterPage(page);
        await expect(register.heading).toBeVisible();
        await expect(register.contextsLegend).toHaveText(CONTEXTS_PROMPT);

        // Both servers listed with "Request the following roles." and a
        // "Reader" box each (a preprint server offers Reader only, Rule 8).
        for (const name of [PK_NAME, scratchName]) {
            const block = register.contextBlock(name);
            await expect(block).toBeVisible();
            await expect(block.locator('fieldset.roles > legend')).toHaveText(ROLES_PROMPT);
            await expect(register.readerBox(name)).toBeVisible();
            await expect(block.locator('input[name^="reviewerGroup"]')).toHaveCount(0);
        }

        // Ticking a role brings that server's consent line into view.
        for (const name of [PK_NAME, scratchName]) {
            await expect(register.contextConsentLine(name)).not.toHaveClass(/context_privacy_visible/);
            await register.readerBox(name).check();
            await expect(register.contextConsentLine(name)).toHaveClass(/context_privacy_visible/);
            await expect(register.contextConsentLine(name)).toContainText(CONTEXT_CONSENT_LABEL);
            await register.contextConsentBox(name).check();
        }
        // The site's own consent box exists only when the site has a
        // statement (Rule 5); tick it when it is there.
        if ((await register.siteConsentBox.count()) > 0) {
            await register.siteConsentBox.check();
        }

        await fillRegistrant(register, r);
        await register.submit();

        // Site-level completion: "Edit My Profile" and "Continue Browsing"
        // only (Rule 10).
        const complete = new RegistrationCompletePage(page);
        await complete.expectShown();
        await complete.expectActions(['Edit My Profile', 'Continue Browsing']);

        // "Edit My Profile" › Roles: exactly the ticked roles in their
        // servers, nothing else (Rule 8).
        await complete.editProfileLink.click();
        const roles = new ProfileRolesTab(page);
        await roles.tab.click();
        await expect(roles.roleBoxes.first()).toBeVisible({timeout: 20_000});
        for (const name of [PK_NAME, scratchName]) {
            const section = roles.contextSection(name);
            await expect(section.getByRole('checkbox', {name: 'Reader', exact: true})).toBeChecked();
            await expect(section.getByRole('checkbox', {name: 'Author', exact: true})).not.toBeChecked();
        }
        expect(await roles.roleBoxes.evaluateAll((els) => els.filter((el) => el.checked).length)).toBe(2);
    });

    test('scenario 7: email validation', async ({page, opsApi, asUser, pkpMail, variants}) => {
        test.slow();
        const tag = makeTag('u02s7');
        const manager = `m${tag}`;
        const support = {name: `Support ${tag}`, email: `${tag}-support-${APP}@mail.test`};
        await opsApi.createContext({tag, users: [{username: manager, roles: ['manager']}]});
        const r = makeRegistrant(tag);
        const base = variants.validation;

        // The scratch server needs a technical support contact to send the
        // validation email (Rule 12; the seeded server has none — A6).
        const managerPage = await (await asUser(manager)).newPage();
        await new ServerSettingsPages(managerPage, tag).setTechnicalSupportContact(support);

        // Register on the validation variant (ALTCHA verifies in the browser).
        const register = new RegisterPage(page);
        await page.goto(`${base}/index.php/${tag}/user/register`);
        await expect(register.heading).toBeVisible();
        await fillRegistrant(register, r);
        await register.privacyConsentBox.check();
        await register.submitThroughAltcha();

        // "Registration awaiting verification": the sentence with the
        // address, the breadcrumb's "Home" as the only link, still signed
        // out (Rule 11).
        await expect(page.getByRole('heading', {name: PENDING_TITLE})).toBeVisible();
        await expect(page.getByText(pendingSentence(r.email))).toBeVisible();
        await expect(page.getByRole('main').getByRole('link')).toHaveText(['Home']);
        await expect(userNav(page).getByRole('link', {name: 'Login', exact: true})).toBeVisible();
        await expect(userNav(page).getByRole('link', {name: 'Register', exact: true})).toBeVisible();

        // Signing in before activating is refused with the disabled reason.
        await signInAt(page, base, tag, r.username, r.password);
        await expect(page.getByText(DISABLED_PREFIX + pendingSentence(r.email))).toBeVisible();
        await expect(page).toHaveURL(/\/login/);

        // The "Validate Your Account" email, from the technical support
        // contact, carries the activation link (Rule 12).
        const message = await pkpMail.find({to: r.email, subject: VALIDATE_SUBJECT});
        expect(message.From.Address).toBe(support.email);
        expect(message.From.Name).toBe(support.name);
        const full = await pkpMail.fullMessage(message.ID);
        const haystack = `${full.Text || ''}\n${full.HTML || ''}`;
        const match = haystack.match(/https?:\/\/[^\s"'<>]*\/invitation\/accept\?[^\s"'<>]+/);
        expect(match, 'validation email must carry the activation link').not.toBeNull();
        const activationLink = match[0].replace(/&amp;/g, '&');
        expect(activationLink.startsWith(base)).toBe(true);

        // The link: "Confirm and activate your account" + "Activate Account";
        // pressing it activates (Rule 13).
        await page.goto(activationLink);
        await expect(page.getByText(ACTIVATE_DESCRIPTION)).toBeVisible();
        await page.getByRole('link', {name: 'Activate Account', exact: true}).click();
        await expect(page.getByText(ACTIVATED)).toBeVisible();

        // Sign-in works now and lands on the server homepage.
        await signInAt(page, base, tag, r.username, r.password);
        await page.waitForURL((url) => !url.pathname.includes('/login'), {waitUntil: 'commit'});
        await expect(page).toHaveURL(new RegExp(`/index\\.php/${tag}(/index)?/?$`));
        await expect(userNav(page)).toContainText(r.username);

        // The emailed link once more: "Invitation Unavailable" with "Login"
        // and "Register" (Rule 14).
        await page.goto(activationLink);
        await expect(page.getByRole('heading', {name: INVITATION_UNAVAILABLE})).toBeVisible();
        await expect(page.getByRole('link', {name: 'Login', exact: true})).toBeVisible();
        await expect(page.getByRole('link', {name: 'Register', exact: true})).toBeVisible();
    });

    test('scenario 8: a signed-in user opening Register sees the completion page', async ({asUser, appContext}) => {
        // A plain Reader/Author account: the three server-level links.
        const authorPage = await (await asUser(appContext.seed.actors.author)).newPage();
        const complete = new RegistrationCompletePage(authorPage);
        await authorPage.goto(`/index.php/${PK}/user/register`);
        await complete.expectShown();
        await expect(authorPage.locator('form#register')).toHaveCount(0);
        await complete.expectActions(['Make a New Submission', 'Edit My Profile', 'Continue Browsing']);

        // A Moderator (OPS's Section Editor) sees "View Submissions" as well
        // (Rule 10).
        const moderatorPage = await (await asUser(appContext.seed.actors.sectionEditor)).newPage();
        const moderatorComplete = new RegistrationCompletePage(moderatorPage);
        await moderatorPage.goto(`/index.php/${PK}/user/register`);
        await moderatorComplete.expectShown();
        await moderatorComplete.expectActions([
            'View Submissions',
            'Make a New Submission',
            'Edit My Profile',
            'Continue Browsing',
        ]);

        // The site-level address: "Edit My Profile" and "Continue Browsing" only.
        await authorPage.goto('/index.php/index/user/register');
        await complete.expectShown();
        await complete.expectActions(['Edit My Profile', 'Continue Browsing']);
    });
});
