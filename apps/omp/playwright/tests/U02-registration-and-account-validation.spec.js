// @ts-check
/**
 * @file playwright/tests/U02-registration-and-account-validation.spec.js
 *
 * U02 — Registration & account validation, OMP suite (spec:
 * docs/specs/U02-registration-and-account-validation.md). One test per
 * canonical scenario the spec runs on a press (common scenarios 1–8, in OMP
 * vocabulary: press, Press Manager, External Reviewer — glossary
 * substitution). The spec lists no OMP-only scenario; OMP1 and OMP2 are
 * register findings, not scenarios.
 *
 * Deliberate non-coverage:
 * - Register findings are never asserted as contract (PRINCIPLES M3): A1 (🐞
 *   link lifetime — a clock, not a screen), A2 (🐞 headless activation pages
 *   — the pages are asserted by their sentences, never by a heading), A3 (🐞
 *   site-level opt-in recorded nowhere), A4 (🐞 closed presses listed on the
 *   site-level page), A6 (🐞 no support contact crashes Register — scenario
 *   7 sets the contact first, as the spec's recipe says), OMP1 (🐞 raw
 *   consent-error codes on the site-level page — scenario 6 ticks every
 *   consent line and never provokes the error), OMP2 (🐞 press consent
 *   lines shown before a role is ticked — scenario 6 ticks the line after
 *   the role and asserts nothing about when it appeared).
 * - A5 and A7 (❓ open questions: the "Login" link's destination, Reader
 *   granted when closed to self-registration) carry no coverage claim.
 * - Rule 6 (email opt-in → Notifications tab), Rule 9's interrupted
 *   destination, Rule 16 (locale copy of the name) and the Side effects
 *   (monthly cleanup, a scheduled task) have no canonical scenario: not
 *   covered.
 * - The spam check is exercised only as scenario 7 meets it: the
 *   validation-variant server has ALTCHA on, and its floating widget
 *   verifies on "Register" (and on "Login") before the form posts; the
 *   refusal branch ("You must complete the validation check…", a browser
 *   without JavaScript) is not driven. reCAPTCHA needs Google's service and
 *   cannot run on the test install (harness.md, the dead-port proxy).
 *
 * Seeding: scenario endpoints only. Scenarios 1–3 and 8 register throwaway
 * accounts on the read-only `publicknowledge` press (registering there
 * changes no setting; the roster users are only read). Scenarios 4–7 use a
 * scratch press with a throwaway Press Manager, because they change a
 * setting (privacy statement, registration, technical support contact).
 * Every registrant has a unique username and mailbox naming app + test
 * (Mailpit is shared across the three fleets — never cleared). Scenario 7
 * runs against the validation-variant server (`variants.validation`, same
 * DB; harness.md), which is the only place `require_validation` is on.
 */
const {test: baseTest, expect} = require('../support/fixtures.js');
const {
    RegisterPage,
    RegistrationCompletePage,
    ProfileRolesTab,
} = require('../pages/RegistrationPages.js');

const PK = 'publicknowledge';
const PK_NAME = 'Public Knowledge Press';

const MSG = {
    usernameTaken: 'The selected username is already in use by another user.',
    emailTaken: 'The selected email address is already in use by another user.',
    passwordsDiffer: 'The passwords do not match.',
    passwordShort: 'The password must be at least 6 characters.',
    consentRequired: 'You must agree to the terms of the privacy statement.',
    registrationClosed: 'This press is currently not accepting user registrations.',
    reviewerOptin:
        'Yes, I would like to be contacted with requests to review submissions to this press.',
    privacyConsent:
        'Yes, I agree to have my data collected and stored according to the privacy statement.',
    contextConsent:
        "Yes, I agree to have my data collected and stored according to this press's privacy statement.",
    pendingTitle: 'Registration awaiting verification',
    activateDescription: 'Confirm and activate your account',
    activated:
        'Thank you for activating your account. You may now log in using the credentials you supplied when you created your account.',
    invitationUnavailable: 'Invitation Unavailable',
};

/** Parallel-safe unique tag: single alphanumeric token, ≤32 chars. */
function makeTag(testInfo, scenarioKey) {
    const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6);
    return `${scenarioKey}ompw${testInfo.parallelIndex}${rand}`;
}

/** A throwaway registrant: username `u02<case>-omp-…` (spec note s). */
function makeRegistrant(tag, suffix = '') {
    const username = `${tag.replace('omp', '-omp-')}${suffix}`;
    return {
        username,
        email: `${username}@mail.test`,
        password: `pw-${username}`,
        givenName: `Reg${tag}${suffix}`,
    };
}

/** The signed-out / signed-in user block of the reader-site header. */
const headerNav = (page) => page.locator('#navigationUser');

/** Fill the login form the page shows and submit it (no landing wait). */
async function submitLoginForm(page, username, password) {
    await page.locator('form#login input#username').fill(username);
    const passwordInput = page.locator('form#login input#password');
    await passwordInput.evaluate((el) => el.removeAttribute('maxlength'));
    await passwordInput.fill(password);
    await page.locator('form#login button[type="submit"]').click();
}

/**
 * Scratch press with a throwaway Press Manager (scenarios 4–7). The
 * default privacy statement and open registration come with it.
 */
async function seedPress(ompApi, tag) {
    const manager = `mgr${tag}`;
    await ompApi.createContext({
        tag,
        context: {name: {en: `U02 Press ${tag}`}},
        users: [
            {
                username: manager,
                roles: ['manager'],
                givenName: `Mgr${tag}`,
                familyName: 'Manager',
            },
        ],
    });
    return {path: tag, name: `U02 Press ${tag}`, manager};
}

/** Save a Vue settings form and wait for the contexts API to answer. */
async function saveSettingsForm(page, panel) {
    const saved = page.waitForResponse(
        (r) => r.url().includes('/api/v1/contexts/') && r.ok()
    );
    await panel.getByRole('button', {name: 'Save', exact: true}).click();
    await saved;
}

/**
 * `freshPage` opens a page in a brand-new, signed-out browser context
 * (never the cached `.auth` state — a registration signs the context in).
 * Auto-closes every opened context at teardown.
 */
const test = baseTest.extend({
    freshPage: async ({browser, baseURL}, use) => {
        const contexts = [];
        await use(async ({baseURL: url = baseURL} = {}) => {
            const context = await browser.newContext({
                baseURL: url,
                storageState: {cookies: [], origins: []},
            });
            contexts.push(context);
            return context.newPage();
        });
        await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    },
});

test.describe('Registration & account validation (U02)', () => {
    test.beforeEach(async ({}, testInfo) => testInfo.setTimeout(180_000));

    test('S1: register with a press and land on the completion page', async ({freshPage}, testInfo) => {
        const tag = makeTag(testInfo, 'u02s1');
        const who = makeRegistrant(tag);
        const page = await freshPage();

        // Press homepage → header "Register" → the Register form.
        await page.goto(`/index.php/${PK}`);
        await headerNav(page).getByRole('link', {name: 'Register', exact: true}).click();
        const register = new RegisterPage(page);
        await expect(register.heading).toBeVisible();
        await expect(page).toHaveURL(/\/user\/register/);
        await expect(page.getByText('Required fields are marked with an asterisk')).toBeVisible();

        await register.fillIdentity(who);
        await expect(register.privacyConsent).not.toBeChecked();
        await register.privacyConsent.check();
        await register.submit();

        // "Registration complete" with three links and no "View Submissions".
        const complete = new RegistrationCompletePage(page);
        await expect(complete.heading).toBeVisible();
        await expect(complete.instructions).toBeVisible();
        await expect(complete.newSubmission).toBeVisible();
        await expect(complete.editProfile).toBeVisible();
        await expect(complete.continueBrowsing).toBeVisible();
        await expect(complete.viewSubmissions).toHaveCount(0);

        // The header now names the new account where "Register"/"Login" were.
        await expect(headerNav(page)).toContainText(who.username);
        await expect(headerNav(page).getByRole('link', {name: 'Register', exact: true})).toHaveCount(0);
        await expect(headerNav(page).getByRole('link', {name: 'Login', exact: true})).toHaveCount(0);

        // "Edit My Profile" › Roles: "Reader" ticked and nothing else.
        await complete.editProfile.click();
        await expect(page.getByRole('heading', {name: 'Profile'})).toBeVisible({timeout: 20_000});
        const roles = new ProfileRolesTab(page);
        await roles.tab.click();
        await expect(roles.userGroups).toBeVisible({timeout: 20_000});
        await expect(roles.currentContextBox('Reader')).toBeChecked();
        await expect(roles.currentContextBox('External Reviewer')).not.toBeChecked();
        await expect(roles.checkedBoxes).toHaveCount(1);
    });

    test('S2: the form refuses bad input', async ({freshPage}, testInfo) => {
        const tag = makeTag(testInfo, 'u02s2');
        const who = makeRegistrant(tag);
        const page = await freshPage();
        await page.goto(RegisterPage.contextUrl(PK));
        const register = new RegisterPage(page);
        await expect(register.heading).toBeVisible();

        // A taken username in capitals, a taken email in capitals, a short
        // password and a different repeat (Rules 15, Fields & validation).
        await register.fillIdentity({
            ...who,
            username: 'Reader.Rosa',
            email: 'READER.ROSA@MAIL.TEST',
            password: 'abc',
            password2: 'abcd',
        });
        await register.privacyConsent.check();
        await register.submit();

        await expect(register.errorsHeading).toHaveText('Errors occurred processing this form:');
        await expect(register.errorLines).toHaveText([
            MSG.usernameTaken,
            MSG.passwordsDiffer,
            MSG.emailTaken,
        ]);
        await expect(register.username).toHaveValue('Reader.Rosa');
        await expect(register.password).toHaveValue('');
        await expect(register.password2).toHaveValue('');
        // Everything else typed is kept.
        await expect(register.givenName).toHaveValue(who.givenName);
        await expect(register.email).toHaveValue('READER.ROSA@MAIL.TEST');

        // A fresh username and email, the same too-short password twice.
        await register.username.fill(who.username);
        await register.email.fill(who.email);
        await register.password.fill('abc');
        await register.password2.fill('abc');
        await expect(register.privacyConsent).toBeChecked();
        await register.submit();
        await expect(register.errorLines).toHaveText([MSG.passwordShort]);
    });

    test('S3: register as a reviewer', async ({freshPage}, testInfo) => {
        const tag = makeTag(testInfo, 'u02s3');
        const who = makeRegistrant(tag);
        const interests = [`ethics${tag}`, `statistics${tag}`];
        const page = await freshPage();
        await page.goto(RegisterPage.contextUrl(PK));
        const register = new RegisterPage(page);
        await expect(register.heading).toBeVisible();

        await register.fillIdentity(who);
        await register.privacyConsent.check();

        // One self-registering reviewer role on the press → the single box;
        // "Reviewing interests" appears only once it is ticked.
        await expect(register.reviewerOptin).toHaveCount(1);
        await expect(page.getByText(MSG.reviewerOptin)).toBeVisible();
        await expect(register.reviewerInterests).toBeHidden();
        await register.reviewerOptin.check();
        await expect(register.reviewerInterests).toBeVisible();
        await expect(register.reviewerInterests.getByText('Reviewing interests')).toBeVisible();
        await register.interests.fill(interests.join(', '));
        await register.submit();

        // The completion page now leads with "View Submissions" → the
        // reviewer's list headed "Action Required by me".
        const complete = new RegistrationCompletePage(page);
        await expect(complete.heading).toBeVisible();
        await expect(complete.viewSubmissions).toBeVisible();
        await expect(complete.newSubmission).toBeVisible();
        await complete.viewSubmissions.click();
        await page.waitForURL(/\/dashboard\/reviewAssignments/, {
            timeout: 20_000,
            waitUntil: 'commit',
        });
        await expect(
            page.getByRole('heading', {name: /Action Required by me/})
        ).toBeVisible({timeout: 20_000});

        // Roles: External Reviewer ticked, Reader not; two separate interests.
        const roles = new ProfileRolesTab(page);
        await roles.open(PK);
        await expect(roles.currentContextBox('External Reviewer')).toBeChecked();
        await expect(roles.currentContextBox('Reader')).not.toBeChecked();
        await expect(roles.checkedBoxes).toHaveCount(1);
        await expect(roles.interestChips).toHaveText(interests);
    });

    test('S4: privacy consent is required when a statement exists', async ({ompApi, asUser, freshPage}, testInfo) => {
        const tag = makeTag(testInfo, 'u02s4');
        const press = await seedPress(ompApi, tag);
        const first = makeRegistrant(tag, 'a');
        const second = makeRegistrant(tag, 'b');

        // A scratch press comes with the default statement: the box is there
        // and "privacy statement" opens the press's page in a new tab.
        const page = await freshPage();
        await page.goto(RegisterPage.contextUrl(press.path));
        const register = new RegisterPage(page);
        await expect(register.heading).toBeVisible();
        await expect(register.privacyConsent).toBeVisible();
        await expect(page.getByText(MSG.privacyConsent)).toBeVisible();
        const popup = page.context().waitForEvent('page');
        await register.form
            .locator('.optin-privacy')
            .getByRole('link', {name: 'privacy statement'})
            .click();
        const privacyPage = await popup;
        await expect(
            privacyPage.getByRole('heading', {name: 'Privacy Statement'})
        ).toBeVisible({timeout: 20_000});
        await privacyPage.close();

        // Unticked: refused with one line; ticked (passwords retyped): complete.
        await register.fillIdentity(first);
        await register.submit();
        await expect(register.errorLines).toHaveText([MSG.consentRequired]);
        await register.privacyConsent.check();
        await register.password.fill(first.password);
        await register.password2.fill(first.password);
        await register.submit();
        await expect(new RegistrationCompletePage(page).heading).toBeVisible();

        // The Press Manager empties the statement (Settings › Website › Setup
        // › Privacy Statement) and saves.
        const managerPage = await (await asUser(press.manager)).newPage();
        await managerPage.goto(`/index.php/${press.path}/management/settings/website`);
        await managerPage.locator('#setup-button').click();
        await managerPage.locator('#privacy-button').click();
        const privacyPanel = managerPage.locator('#privacy');
        // The rich-text field is a TinyMCE iframe; select all and delete.
        const editor = privacyPanel.frameLocator('iframe').locator('body');
        await expect(editor).toContainText(/\w/, {timeout: 20_000});
        await editor.click();
        await managerPage.keyboard.press('ControlOrMeta+a');
        await managerPage.keyboard.press('Backspace');
        await expect(editor).toHaveText('');
        await saveSettingsForm(managerPage, privacyPanel);
        await expect(managerPage.getByRole('status').filter({hasText: 'Saved'})).toBeVisible({
            timeout: 20_000,
        });

        // A visitor now finds no consent box (the notification box beside it
        // is the positive control) and registers without it.
        const visitor = await freshPage();
        await visitor.goto(RegisterPage.contextUrl(press.path));
        const register2 = new RegisterPage(visitor);
        await expect(register2.heading).toBeVisible();
        await expect(register2.emailConsent).toBeVisible();
        await expect(register2.privacyConsent).toHaveCount(0);
        await expect(visitor.getByText(MSG.privacyConsent)).toHaveCount(0);
        await register2.fillIdentity(second);
        await register2.submit();
        await expect(new RegistrationCompletePage(visitor).heading).toBeVisible();
    });

    test('S5: closed registration', async ({ompApi, asUser, freshPage}, testInfo) => {
        const tag = makeTag(testInfo, 'u02s5');
        const press = await seedPress(ompApi, tag);

        // Press Manager: Settings › Users & Roles › Site Access Options →
        // "The Press Manager will register all user accounts…" → Save.
        const managerPage = await (await asUser(press.manager)).newPage();
        await managerPage.goto(`/index.php/${press.path}/management/settings/access`);
        await managerPage.locator('#access-button').click();
        const accessPanel = managerPage.locator('#access');
        const closed = accessPanel.getByRole('radio', {
            name: /The Press Manager will register all user accounts/,
        });
        await expect(closed).toBeVisible({timeout: 20_000});
        await closed.check();
        await saveSettingsForm(managerPage, accessPanel);

        // A visitor: no "Register" in the header (Login stays), none on the
        // Login page (its form stays).
        const page = await freshPage();
        await page.goto(`/index.php/${press.path}`);
        await expect(headerNav(page).getByRole('link', {name: 'Login', exact: true})).toBeVisible();
        await expect(headerNav(page).getByRole('link', {name: 'Register', exact: true})).toHaveCount(0);
        await page.goto(`/index.php/${press.path}/login`);
        await expect(page.locator('form#login')).toBeVisible();
        await expect(page.getByRole('link', {name: 'Register', exact: true})).toHaveCount(0);

        // The typed Register address answers the closed page with a Login link.
        await page.goto(RegisterPage.contextUrl(press.path));
        await expect(page.getByRole('heading', {name: 'Register', exact: true})).toBeVisible();
        await expect(page.getByText(MSG.registrationClosed)).toBeVisible();
        await expect(page.locator('.page_error').getByRole('link', {name: 'Login', exact: true})).toBeVisible();
        await expect(page.locator('form#register')).toHaveCount(0);

        // The site homepage's "Register" still opens the site-level form,
        // because the seeded press is still open.
        await page.goto('/index.php/index');
        await headerNav(page).getByRole('link', {name: 'Register', exact: true}).click();
        const siteRegister = new RegisterPage(page);
        await expect(siteRegister.heading).toBeVisible();
        await expect(siteRegister.form).toBeVisible();
        await expect(siteRegister.contextsLegend).toBeVisible();
        await expect(siteRegister.contextRoleBox(PK_NAME, 'Reader')).toBeVisible();
    });

    test('S6: register from the site homepage with roles in two presses', async ({ompApi, freshPage}, testInfo) => {
        const tag = makeTag(testInfo, 'u02s6');
        const press = await seedPress(ompApi, tag);
        const who = makeRegistrant(tag);

        // Site homepage (the press list) → header "Register" → site-level form.
        const page = await freshPage();
        await page.goto('/index.php/index');
        await headerNav(page).getByRole('link', {name: 'Register', exact: true}).click();
        const register = new RegisterPage(page);
        await expect(register.heading).toBeVisible();
        await expect(page).toHaveURL(/\/index\/(en\/)?user\/register/);
        await expect(register.contextsLegend).toBeVisible();

        // Both presses listed with "Request the following roles."; tick
        // "Reader" under the seeded press and "External Reviewer" under the
        // scratch one, then the consent line under each.
        for (const name of [PK_NAME, press.name]) {
            await expect(register.contextBlock(name)).toHaveCount(1);
            await expect(
                register.contextBlock(name).getByText('Request the following roles.')
            ).toBeVisible();
        }
        await register.contextRoleBox(PK_NAME, 'Reader').check();
        await register.contextRoleBox(press.name, 'External Reviewer').check();
        await expect(register.contextBlock(PK_NAME).getByText(MSG.contextConsent)).toBeVisible();
        await expect(register.contextBlock(press.name).getByText(MSG.contextConsent)).toBeVisible();
        await register.contextConsent(PK_NAME).check();
        await register.contextConsent(press.name).check();
        // The site's own consent box exists only when the site has a
        // statement (Rule 5); the test site's is not set — tick it if present.
        if ((await register.siteConsent.count()) > 0) {
            await register.siteConsent.check();
        }

        await register.fillIdentity(who);
        await register.submit();

        // Site-level completion: "Edit My Profile" and "Continue Browsing" only.
        const complete = new RegistrationCompletePage(page);
        await expect(complete.heading).toBeVisible();
        await expect(complete.editProfile).toBeVisible();
        await expect(complete.continueBrowsing).toBeVisible();
        await expect(complete.newSubmission).toHaveCount(0);
        await expect(complete.viewSubmissions).toHaveCount(0);

        // Roles: exactly the ticked roles in their presses.
        await complete.editProfile.click();
        await expect(page.getByRole('heading', {name: 'Profile'})).toBeVisible({timeout: 20_000});
        const roles = new ProfileRolesTab(page);
        await roles.tab.click();
        await expect(roles.userGroups).toBeVisible({timeout: 20_000});
        await expect(roles.contextBox(PK_NAME, 'Reader')).toBeChecked();
        await expect(roles.contextBox(PK_NAME, 'External Reviewer')).not.toBeChecked();
        await expect(roles.contextBox(press.name, 'External Reviewer')).toBeChecked();
        await expect(roles.contextBox(press.name, 'Reader')).not.toBeChecked();
        await expect(roles.checkedBoxes).toHaveCount(2);
    });

    test('S7: email validation', async ({ompApi, asUser, pkpMail, freshPage, variants}, testInfo) => {
        const tag = makeTag(testInfo, 'u02s7');
        const press = await seedPress(ompApi, tag);
        const who = makeRegistrant(tag);
        const support = {name: `Support ${tag}`, email: `${tag}-support@mail.test`};

        // The Press Manager sets Settings › Press › Contact › "Technical
        // Support Contact" (the validation mail is sent from it; Rule 12).
        const managerPage = await (await asUser(press.manager)).newPage();
        await managerPage.goto(`/index.php/${press.path}/management/settings/context`);
        await managerPage.locator('#contact-button').click();
        const contactPanel = managerPage.locator('#contact');
        const supportGroup = contactPanel.getByRole('group', {name: 'Technical Support Contact'});
        await expect(supportGroup).toBeVisible({timeout: 20_000});
        await supportGroup.getByRole('textbox', {name: /^Name/}).fill(support.name);
        await supportGroup.getByRole('textbox', {name: /^Email/}).fill(support.email);
        await saveSettingsForm(managerPage, contactPanel);

        // A visitor on the validation-variant server registers; the ALTCHA
        // widget (on there) verifies as "Register" is pressed and the form
        // goes through to "Registration awaiting verification".
        const base = variants.validation;
        const page = await freshPage({baseURL: base});
        await page.goto(`${base}${RegisterPage.contextUrl(press.path)}`);
        const register = new RegisterPage(page);
        await expect(register.heading).toBeVisible();
        await expect(register.altchaWidget).toHaveCount(1);
        await register.fillIdentity(who);
        await register.privacyConsent.check();
        await register.submit();
        await expect(
            page.getByRole('heading', {name: MSG.pendingTitle})
        ).toBeVisible({timeout: 30_000});
        await expect(
            page.getByText(`We've sent a confirmation email to you at ${who.email}.`)
        ).toBeVisible();
        await expect(page.getByText('Please follow the instructions in that email')).toBeVisible();
        // Still a signed-out site; the page's only link is the breadcrumb's "Home".
        await expect(headerNav(page).getByRole('link', {name: 'Login', exact: true})).toBeVisible();
        await expect(headerNav(page)).not.toContainText(who.username);
        const main = page.locator('.page_message');
        await expect(main.getByRole('link', {name: 'Home'})).toBeVisible();
        await expect(main.getByRole('link')).toHaveCount(1);

        // Signing in before activating is refused with the disabled reason.
        await page.goto(`${base}/index.php/${press.path}/login`);
        await submitLoginForm(page, who.username, who.password);
        await expect(
            page.getByText(
                `Your account has been disabled for the following reason: We've sent a confirmation email to you at ${who.email}.`
            )
        ).toBeVisible({timeout: 20_000});
        await expect(page.locator('form#login')).toBeVisible();

        // The "Validate Your Account" email, from the technical support
        // contact, carries the activation link.
        const summary = await pkpMail.find({to: who.email, subject: 'Validate Your Account'});
        expect(summary.From.Address).toBe(support.email);
        expect(summary.From.Name).toBe(support.name);
        const full = await pkpMail.fullMessage(summary.ID);
        expect(full.Text).toContain(`You have created an account with ${press.name}`);
        const match = (full.Text || '').match(/https?:\/\/\S*invitation\/accept\S*/);
        const link = (match ? match[0] : pkpMail.extractLink(full.HTML, /activate|accept|http/i)) || '';
        expect(link, 'validation email carries the activation link').toMatch(/invitation\/accept/);

        // The link: "Confirm and activate your account" → "Activate Account".
        await page.goto(link);
        await expect(page.getByText(MSG.activateDescription)).toBeVisible();
        const activate = page.getByRole('link', {name: 'Activate Account'});
        await expect(activate).toBeVisible();
        await activate.click();
        await expect(page.getByText(MSG.activated)).toBeVisible({timeout: 20_000});

        // Sign in: works, landing on the press homepage.
        await page.goto(`${base}/index.php/${press.path}/login`);
        await submitLoginForm(page, who.username, who.password);
        await page.waitForURL((url) => !url.pathname.includes('/login'), {
            timeout: 20_000,
            waitUntil: 'commit',
        });
        await expect(page).toHaveURL(new RegExp(`/index.php/${press.path}(/index)?/?$`));
        await expect(headerNav(page)).toContainText(who.username);

        // The emailed link once more: "Invitation Unavailable" with Login and
        // Register buttons.
        const again = await freshPage({baseURL: base});
        await again.goto(link);
        await expect(
            again.getByRole('heading', {name: MSG.invitationUnavailable})
        ).toBeVisible({timeout: 20_000});
        const unavailable = again.locator('.page_invitation_unavailable');
        await expect(unavailable.getByRole('link', {name: 'Login', exact: true})).toBeVisible();
        await expect(unavailable.getByRole('link', {name: 'Register', exact: true})).toBeVisible();
        await expect(again.getByRole('link', {name: 'Activate Account'})).toHaveCount(0);
    });

    test('S8: a signed-in user opening Register sees the completion page', async ({asUser}) => {
        // An Author (no Rule-10 role): three links, no "View Submissions".
        const authorPage = await (await asUser('author.alex')).newPage();
        await authorPage.goto(RegisterPage.contextUrl(PK));
        const authorComplete = new RegistrationCompletePage(authorPage);
        await expect(authorComplete.heading).toBeVisible();
        await expect(authorPage.locator('form#register')).toHaveCount(0);
        await expect(authorComplete.newSubmission).toBeVisible();
        await expect(authorComplete.editProfile).toBeVisible();
        await expect(authorComplete.continueBrowsing).toBeVisible();
        await expect(authorComplete.viewSubmissions).toHaveCount(0);

        // A Series Editor holds a Rule-10 role: "View Submissions" as well.
        const editorPage = await (await asUser('sectioneditor.ana')).newPage();
        await editorPage.goto(RegisterPage.contextUrl(PK));
        const editorComplete = new RegistrationCompletePage(editorPage);
        await expect(editorComplete.heading).toBeVisible();
        await expect(editorComplete.viewSubmissions).toBeVisible();
        await expect(editorComplete.newSubmission).toBeVisible();
        await expect(editorComplete.editProfile).toBeVisible();
        await expect(editorComplete.continueBrowsing).toBeVisible();

        // The site-level address: "Edit My Profile" and "Continue Browsing" only.
        await editorPage.goto(RegisterPage.siteUrl());
        const siteComplete = new RegistrationCompletePage(editorPage);
        await expect(siteComplete.heading).toBeVisible();
        await expect(siteComplete.editProfile).toBeVisible();
        await expect(siteComplete.continueBrowsing).toBeVisible();
        await expect(siteComplete.newSubmission).toHaveCount(0);
        await expect(siteComplete.viewSubmissions).toHaveCount(0);
    });
});
