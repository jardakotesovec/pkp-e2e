// @ts-check
/**
 * @file playwright/tests/U02-registration-and-account-validation.spec.js
 *
 * Registration & account validation — OJS suite, one test per canonical
 * scenario the spec runs on OJS (scenarios 1–8; the spec lists no
 * OJS-specific scenario).
 * Spec: docs/specs/U02-registration-and-account-validation.md
 *
 * Deliberately NOT covered (one line per omission, citing the register ID or
 * rule):
 * - A1 🐞 (activation links die after 3 days, not the configured 14): a
 *   clock, not a screen, settles it; not covered.
 * - A2 🐞 (headless activation pages, no Login link after activating): S7
 *   asserts the two pages' sentences and the button, never a heading or the
 *   missing link.
 * - A3 🐞 (site-level notification opt-in records nothing): not asserted.
 * - A4 🐞 (closed journals listed on the site-level page with no roles): S5
 *   proves only that the site-level page still opens with its form.
 * - A5 ❓ (the form's "Login" link aims at the Roles tab but lands as usual):
 *   open question, never driven.
 * - A6 🐞 (validation required + no support contact: empty page, stranded
 *   account): never driven; S7 sets the support contact first, as the
 *   scenario says.
 * - A7 ❓ (Reader granted even when closed to self-registration): open
 *   question; the self-registration flag is not touched.
 * - Rule 2's disabled-journal and every-journal-closed legs, Rule 3
 *   (restricted journals still register), Rule 9's interrupted-destination
 *   leg, Rule 6's Notifications-tab effect, Rule 16 (name copied into the
 *   primary language), Rule 12's site-level validation email and the
 *   monthly cleanup task (JOB-053, a serial scheduled-task run): rule
 *   details outside the canonical scenarios; not covered.
 * - Spam checks: reCAPTCHA cannot be driven behind the dead-port proxy, and
 *   the ALTCHA refusal (a browser without JavaScript) is not a canonical
 *   scenario; the ALTCHA pass is exercised incidentally by S7's register and
 *   sign-in presses on the validation-variant server.
 *
 * Isolation: every registration uses a throwaway username (`u02<scenario>ojs…`)
 * on the seeded journal or on a scratch journal; settings change only on
 * scratch journals, through the manager's own screens. Sign-ins that follow
 * a registration happen in the test's own anonymous context, never through
 * the shared .auth cache. Mailpit reads are scoped by the throwaway address
 * (PRINCIPLES A8). S7 navigates explicitly to the validation-variant server
 * (`variants.validation`, PRINCIPLES D9), which shares the fleet's database.
 * No hard-coded waits.
 */
const {test, expect} = require('../support/fixtures.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {
    RegisterPage,
    RegistrationCompletePage,
    ProfileRolesTab,
    siteHeader,
} = require('../pages/RegistrationPages.js');
const {waitForContextSettingsSave} = require('../pages/PublicationMetadataPages.js');

const JOURNAL = 'publicknowledge';
const JOURNAL_NAME = 'Journal of Public Knowledge';
const CONSENT_ERROR = 'You must agree to the terms of the privacy statement.';
const USERNAME_TAKEN = 'The selected username is already in use by another user.';
const EMAIL_TAKEN = 'The selected email address is already in use by another user.';
const PASSWORDS_MISMATCH = 'The passwords do not match.';
const PASSWORD_TOO_SHORT = 'The password must be at least 6 characters.';
const CLOSED_MESSAGE = 'This journal is currently not accepting user registrations.';
const CLOSED_OPTION = /^The Journal Manager will register all user accounts/;

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u02${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway registrant: the tag doubles as a valid username. */
function registrant(tag) {
    return {username: tag, email: `${tag}@mail.test`, password: `Pass${tag}`};
}

/** A fresh, explicitly-anonymous context (never inherits cached storage state). */
async function anonContext(browser, baseURL) {
    return browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
}

/**
 * Fill the whole journal-level form for a fresh registrant and tick the
 * privacy consent; the caller presses "Register".
 */
async function fillJournalForm(register, who) {
    await register.fillProfile();
    await register.fillLogin(who);
    await register.privacyConsent.check();
}

/** The scratch journal's Settings screen, one tab, as the manager. */
async function openSettingsTab(managerPage, contextPath, screen, tabId) {
    await managerPage.goto(`/index.php/${contextPath}/management/settings/${screen}`);
    await managerPage.locator(`#${tabId}-button`).click();
}

/** Press the Save of the Vue settings form holding `anchor`, wait for the write and "Saved". */
async function saveSettingsForm(managerPage, anchor) {
    const saved = waitForContextSettingsSave(managerPage);
    await managerPage
        .locator('form')
        .filter({has: anchor})
        .getByRole('button', {name: 'Save', exact: true})
        .click();
    await saved;
    await expect(managerPage.locator('[role="status"]:has-text("Saved")')).toBeVisible({
        timeout: 30_000,
    });
}

/**
 * On a server with the ALTCHA check on, the Login form's widget verifies on
 * submit and posts the form itself (spec, "Spam check"); wait only for the
 * widget's script to be live before pressing.
 */
async function spamCheckReady(page) {
    if ((await page.locator('altcha-widget').count()) > 0) {
        await page.waitForFunction(() => !!customElements.get('altcha-widget'), undefined, {
            timeout: 30_000,
        });
    }
}

test.describe('registration & account validation', () => {
    test('S1: register with a journal and land on the completion page', {tag: '@smoke'}, async ({page}, testInfo) => {
        const who = registrant(makeTag('s1', testInfo));

        // From the journal's homepage, the header's "Register" opens the form
        // (Rule 1).
        await page.goto(`/index.php/${JOURNAL}`);
        await siteHeader(page).getByRole('link', {name: 'Register', exact: true}).click();
        const register = new RegisterPage(page, JOURNAL);
        await register.expectForm();
        await expect(page).toHaveURL(/\/user\/register/);
        await expect(page.getByText('Required fields are marked with an asterisk: *')).toBeVisible();

        await fillJournalForm(register, who);
        await register.submitButton.click();

        // "Registration complete" with its three links and no "View
        // Submissions" (Rules 9–10).
        const complete = new RegistrationCompletePage(page);
        await complete.expectOpen();
        await complete.expectLinks(['Make a New Submission', 'Edit My Profile', 'Continue Browsing']);

        // Signed in at once: the header shows the username where "Register"
        // and "Login" were.
        await expect(siteHeader(page)).toContainText(who.username);
        await expect(siteHeader(page).getByRole('link', {name: 'Register', exact: true})).toHaveCount(0);
        await expect(siteHeader(page).getByRole('link', {name: 'Login', exact: true})).toHaveCount(0);

        // "Edit My Profile" › Roles: Reader ticked and nothing else (Rule 7).
        await complete.link('Edit My Profile').click();
        const roles = new ProfileRolesTab(page, JOURNAL);
        await roles.open();
        await expect(roles.roleBox('Reader')).toBeChecked();
        await expect(roles.roleBox('Reviewer')).not.toBeChecked();
        await expect(roles.roleBox('Author')).not.toBeChecked();
        await expect(roles.form.locator('input[type="checkbox"]:checked')).toHaveCount(1);
    });

    test('S2: the form refuses bad input', async ({page}, testInfo) => {
        const who = registrant(makeTag('s2', testInfo));
        const register = new RegisterPage(page, JOURNAL);
        await register.goto();
        await register.expectForm();
        await register.fillProfile();
        await register.privacyConsent.check();

        // A taken username in capitals, a taken email in capitals, a short
        // password and a different repeat: exactly three lines, in order
        // (Fields & validation, Rule 15).
        await register.fillLogin({
            username: 'Reader.Rosa',
            email: 'READER.ROSA@MAIL.TEST',
            password: 'abc',
            password2: 'abd',
        });
        await register.submitButton.click();
        await register.expectErrors([USERNAME_TAKEN, PASSWORDS_MISMATCH, EMAIL_TAKEN]);
        await expect(register.username).toHaveValue('Reader.Rosa');
        await expect(register.password).toHaveValue('');
        await expect(register.password2).toHaveValue('');

        // A fresh username and email with a password below the site minimum,
        // the same in both boxes: one line.
        await register.privacyConsent.setChecked(true);
        await register.fillLogin({username: who.username, email: who.email, password: 'abc'});
        await register.submitButton.click();
        await register.expectErrors([PASSWORD_TOO_SHORT]);
    });

    test('S3: register as a reviewer', async ({page}, testInfo) => {
        test.slow();
        const who = registrant(makeTag('s3', testInfo));
        const register = new RegisterPage(page, JOURNAL);
        await register.goto();
        await register.expectForm();
        await fillJournalForm(register, who);

        // The single reviewer box; "Reviewing interests" appears once it is
        // ticked (Rule 7).
        await expect(
            register.form.getByText(
                'Yes, I would like to be contacted with requests to review submissions to this journal.'
            )
        ).toBeVisible();
        await expect(register.reviewerOptin).toHaveCount(1);
        await expect(register.reviewerInterests).toBeHidden();
        await register.reviewerOptin.check();
        await expect(register.reviewerInterests).toBeVisible();
        await expect(register.reviewerInterests.getByText('Reviewing interests')).toBeVisible();
        await register.interests.fill('ethics, statistics');
        await register.submitButton.click();

        // The completion page now leads with "View Submissions", which opens
        // the reviewer's list headed "Action Required by me" (Rule 10).
        const complete = new RegistrationCompletePage(page);
        await complete.expectOpen();
        await complete.expectLinks([
            'View Submissions',
            'Make a New Submission',
            'Edit My Profile',
            'Continue Browsing',
        ]);
        await complete.link('View Submissions').click();
        await expect(page.getByRole('heading', {name: /^Action Required by me/})).toBeVisible({
            timeout: 30_000,
        });

        // Roles: Reviewer ticked, Reader not, both interests listed separately.
        const roles = new ProfileRolesTab(page, JOURNAL);
        await roles.goto();
        await expect(roles.roleBox('Reviewer')).toBeChecked();
        await expect(roles.roleBox('Reader')).not.toBeChecked();
        await expect(roles.interestChips).toHaveText(['ethics', 'statistics']);
    });

    test('S4: privacy consent is required when a statement exists', async ({page, context, browser, baseURL, ojsApi, asUser}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const manager = `mgr${tag}`;
        const first = registrant(tag);
        const second = registrant(`${tag}b`);
        await ojsApi.createContext({tag, users: [{username: manager, roles: ['manager']}]});

        // A new journal comes with the default statement, so the box is there
        // and "privacy statement" opens the journal's page in a new tab
        // (Rule 5).
        const register = new RegisterPage(page, tag);
        await register.goto();
        await register.expectForm();
        await expect(register.privacyConsent).toBeVisible();
        const [statementTab] = await Promise.all([
            context.waitForEvent('page'),
            register.privacyStatementLink.click(),
        ]);
        await expect(statementTab.getByRole('heading', {name: 'Privacy Statement'})).toBeVisible();
        await expect(statementTab).toHaveURL(new RegExp(`/${tag}/(en/)?about/privacy`));
        await statementTab.close();

        // Unticked: refused with one line; ticked and retyped: complete.
        await register.fillProfile();
        await register.fillLogin(first);
        await register.submitButton.click();
        await register.expectErrors([CONSENT_ERROR]);
        await register.privacyConsent.check();
        await register.password.fill(first.password);
        await register.password2.fill(first.password);
        await register.submitButton.click();
        await new RegistrationCompletePage(page).expectOpen();

        // The Journal Manager empties the statement (Settings › Website ›
        // Setup › Privacy Statement) and saves.
        const managerPage = await (await asUser(manager)).newPage();
        await openSettingsTab(managerPage, tag, 'website', 'setup');
        await managerPage.locator('#privacy-button').click();
        const editorId = 'privacy-privacyStatement-control-en';
        await managerPage.waitForFunction(
            (id) => !!window.tinymce?.get(id)?.initialized,
            editorId,
            {timeout: 30_000}
        );
        await managerPage.evaluate((id) => {
            const editor = window.tinymce.get(id);
            editor.setContent('');
            editor.fire('change');
        }, editorId);
        await saveSettingsForm(managerPage, managerPage.locator(`#${editorId}`));

        // A visitor, signed out: the box is absent (the notification box beside
        // it is the positive control) and the same form registers without it.
        const visitor = await anonContext(browser, baseURL);
        try {
            const visitorPage = await visitor.newPage();
            const again = new RegisterPage(visitorPage, tag);
            await again.goto();
            await again.expectForm();
            await expect(again.emailConsent).toBeVisible();
            await expect(again.privacyConsent).toHaveCount(0);
            await again.fillProfile();
            await again.fillLogin(second);
            await again.submitButton.click();
            await new RegistrationCompletePage(visitorPage).expectOpen();
        } finally {
            await visitor.close();
        }
    });

    test('S5: closed registration', async ({page, ojsApi, asUser}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const manager = `mgr${tag}`;
        await ojsApi.createContext({tag, users: [{username: manager, roles: ['manager']}]});

        // The Journal Manager closes registration (Settings › Users & Roles ›
        // Site Access Options).
        const managerPage = await (await asUser(manager)).newPage();
        await openSettingsTab(managerPage, tag, 'access', 'access');
        const closedOption = managerPage.getByRole('radio', {name: CLOSED_OPTION});
        await expect(closedOption).toBeVisible({timeout: 30_000});
        await closedOption.check();
        await saveSettingsForm(managerPage, closedOption);

        // A visitor, signed out: the header and the Login page offer no
        // "Register" (Rule 2); "Login" and "Forgot your password?" are the
        // positive controls.
        await page.goto(`/index.php/${tag}`);
        await expect(siteHeader(page).getByRole('link', {name: 'Login', exact: true})).toBeVisible();
        await expect(siteHeader(page).getByRole('link', {name: 'Register', exact: true})).toHaveCount(0);
        await page.goto(`/index.php/${tag}/login`);
        await expect(page.locator('form#login')).toBeVisible();
        await expect(page.getByRole('main').getByRole('link', {name: 'Forgot your password?'})).toBeVisible();
        await expect(page.getByRole('main').getByRole('link', {name: 'Register', exact: true})).toHaveCount(0);

        // The typed Register address answers the closed page with a "Login"
        // link and no form.
        const register = new RegisterPage(page, tag);
        await register.goto();
        await expect(register.heading).toBeVisible();
        await expect(page.getByText(CLOSED_MESSAGE)).toBeVisible();
        await expect(page.getByRole('main').getByRole('link', {name: 'Login', exact: true})).toBeVisible();
        await expect(register.form).toHaveCount(0);

        // The site homepage's "Register" still opens the site-level page: the
        // seeded journal is still open.
        await page.goto('/index.php/index');
        await siteHeader(page).getByRole('link', {name: 'Register', exact: true}).click();
        const siteRegister = new RegisterPage(page, null);
        await siteRegister.expectForm();
        await expect(page).toHaveURL(/\/index\/(en\/)?user\/register/);
        await expect(siteRegister.contextsLegend).toBeVisible();
    });

    test('S6: register from the site homepage with roles in two journals', async ({page, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const who = registrant(tag);
        const scratchName = `Scratch journal ${tag}`;
        await ojsApi.createContext({tag, context: {name: {en: scratchName}}});

        // The site homepage (the journal list) › "Register" (Rule 1).
        await page.goto('/index.php/index');
        await siteHeader(page).getByRole('link', {name: 'Register', exact: true}).click();
        const register = new RegisterPage(page, null);
        await register.expectForm();
        await expect(register.contextsLegend).toBeVisible();

        // Both journals are listed with "Request the following roles.".
        const seededBlock = register.contextBlock(JOURNAL_NAME);
        const scratchBlock = register.contextBlock(scratchName);
        await expect(seededBlock).toHaveCount(1);
        await expect(scratchBlock).toHaveCount(1);
        await expect(seededBlock).toContainText('Request the following roles.');
        await expect(scratchBlock).toContainText('Request the following roles.');

        // Reader under one, Reviewer under the other; each journal's consent
        // line appears the moment a role is ticked (Rules 5, 8).
        const seededConsent = register.contextConsent(seededBlock);
        const scratchConsent = register.contextConsent(scratchBlock);
        await expect(seededConsent).not.toBeInViewport();
        await seededBlock.getByRole('checkbox', {name: 'Reader', exact: true}).check();
        await seededConsent.scrollIntoViewIfNeeded();
        await expect(seededConsent).toBeInViewport();
        await expect(seededConsent).toContainText(
            "Yes, I agree to have my data collected and stored according to this journal's privacy statement."
        );
        await seededConsent.locator('input[type="checkbox"]').check();
        await expect(scratchConsent).not.toBeInViewport();
        await scratchBlock.getByRole('checkbox', {name: 'Reviewer', exact: true}).check();
        await scratchConsent.scrollIntoViewIfNeeded();
        await expect(scratchConsent).toBeInViewport();
        await scratchConsent.locator('input[type="checkbox"]').check();
        // The site's own consent box exists only when the site has a Privacy
        // Statement (Rule 5); the test install has none, but tick it if present.
        if ((await register.siteConsent.count()) > 0) {
            await register.siteConsent.check();
        }

        await register.fillProfile();
        await register.fillLogin(who);
        await register.submitButton.click();

        // Site-level completion: two links only (Rule 10).
        const complete = new RegistrationCompletePage(page);
        await complete.expectOpen();
        await complete.expectLinks(['Edit My Profile', 'Continue Browsing']);

        // "Edit My Profile" › Roles lists every journal; exactly the ticked
        // roles are held (Rule 8).
        await complete.link('Edit My Profile').click();
        const roles = new ProfileRolesTab(page, null);
        await roles.open();
        const seededRoles = roles.journalSection(JOURNAL_NAME);
        const scratchRoles = roles.journalSection(scratchName);
        await expect(seededRoles.getByRole('checkbox', {name: 'Reader', exact: true})).toBeChecked();
        await expect(seededRoles.getByRole('checkbox', {name: 'Reviewer', exact: true})).not.toBeChecked();
        await expect(scratchRoles.getByRole('checkbox', {name: 'Reviewer', exact: true})).toBeChecked();
        await expect(scratchRoles.getByRole('checkbox', {name: 'Reader', exact: true})).not.toBeChecked();
        await expect(roles.form.locator('input[type="checkbox"]:checked')).toHaveCount(2);
    });

    test('S7: email validation', async ({browser, baseURL, variants, ojsApi, asUser, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s7', testInfo);
        const manager = `mgr${tag}`;
        const who = registrant(tag);
        const support = {name: `Support ${tag}`, email: `${tag}support@mail.test`};
        await ojsApi.createContext({tag, users: [{username: manager, roles: ['manager']}]});

        // The journal needs a technical support contact (Settings › Journal ›
        // Contact) to send the validation email (Rule 12; A6 is never driven).
        const managerPage = await (await asUser(manager)).newPage();
        await openSettingsTab(managerPage, tag, 'context', 'contact');
        const supportName = managerPage.locator('#contact-supportName-control');
        await expect(supportName).toBeVisible({timeout: 30_000});
        await supportName.fill(support.name);
        await managerPage.locator('#contact-supportEmail-control').fill(support.email);
        await saveSettingsForm(managerPage, supportName);

        // A visitor, signed out, on the validation-variant server (email
        // validation and ALTCHA on; same database).
        const origin = variants.validation;
        const visitor = await anonContext(browser, baseURL);
        try {
            const page = await visitor.newPage();
            const register = new RegisterPage(page, tag, {origin});
            await register.goto();
            await register.expectForm();
            await fillJournalForm(register, who);
            await register.submitWithSpamCheck();

            // "Registration awaiting verification": not signed in, the
            // breadcrumb's "Home" its only link (Rule 11).
            await expect(
                page.getByRole('heading', {name: 'Registration awaiting verification'})
            ).toBeVisible({timeout: 30_000});
            await expect(
                page.getByText(
                    `We've sent a confirmation email to you at ${who.email}. Please follow the instructions in that email to activate your new account. If you do not see an email, please check to see if it was put in your spam folder.`
                )
            ).toBeVisible();
            await expect(page.getByRole('main').getByRole('link')).toHaveText(['Home']);
            await expect(siteHeader(page).getByRole('link', {name: 'Register', exact: true})).toBeVisible();
            await expect(siteHeader(page).getByRole('link', {name: 'Login', exact: true})).toBeVisible();

            // Signing in before activating is refused with the same sentence.
            const loginPage = new LoginPage(page);
            await page.goto(`${origin}/index.php/${tag}/login`);
            await loginPage.usernameInput.fill(who.username);
            await loginPage.fillPassword(who.password);
            await spamCheckReady(page);
            await loginPage.submitButton.click();
            await expect(
                page.getByText(
                    `Your account has been disabled for the following reason: We've sent a confirmation email to you at ${who.email}.`
                )
            ).toBeVisible();

            // One "Validate Your Account" email from the journal's technical
            // support contact, carrying the activation link (Rule 12).
            const summary = await pkpMail.find({to: who.email, subject: 'Validate Your Account'});
            expect(summary.From.Address).toBe(support.email);
            expect(summary.From.Name).toBe(support.name);
            expect(await pkpMail.count({to: who.email})).toBe(1);
            const full = await pkpMail.fullMessage(summary.ID);
            const body = full.Text || full.HTML;
            expect(body).toContain(
                'but before you can start using it, you need to validate your email account. To do this, simply follow the link below:'
            );
            const match = body.match(/https?:\/\/[^\s<>"']+\/invitation\/accept\?[^\s<>"']+/);
            expect(match, 'activation link present in the email').toBeTruthy();
            const activationLink = match[0].replace(/&amp;/g, '&');
            expect(activationLink.startsWith(origin)).toBe(true);

            // The link: "Confirm and activate your account" › "Activate
            // Account" › the thank-you sentence (Rule 13).
            await page.goto(activationLink);
            await expect(page.getByText('Confirm and activate your account')).toBeVisible();
            await page.getByRole('link', {name: 'Activate Account', exact: true}).click();
            await expect(
                page.getByText(
                    'Thank you for activating your account. You may now log in using the credentials you supplied when you created your account.'
                )
            ).toBeVisible();

            // Signing in now works and lands on the journal homepage.
            await page.goto(`${origin}/index.php/${tag}/login`);
            await loginPage.usernameInput.fill(who.username);
            await loginPage.fillPassword(who.password);
            await spamCheckReady(page);
            await loginPage.submitButton.click();
            await page.waitForURL((url) => !url.pathname.includes('/login'), {
                waitUntil: 'commit',
                timeout: 30_000,
            });
            await expect(page).toHaveURL(new RegExp(`^${origin}/index\\.php/${tag}(/en)?(/index)?/?$`));
            await expect(siteHeader(page)).toContainText(who.username);

            // The emailed link once more: "Invitation Unavailable" with
            // "Login" and "Register" (Rule 14).
            await page.goto(activationLink);
            await expect(page.getByRole('heading', {name: 'Invitation Unavailable'})).toBeVisible();
            const landing = page.locator('.page_invitation_unavailable');
            await expect(landing.getByRole('link', {name: 'Login', exact: true})).toBeVisible();
            await expect(landing.getByRole('link', {name: 'Register', exact: true})).toBeVisible();
            await expect(page.getByRole('link', {name: 'Activate Account', exact: true})).toHaveCount(0);
        } finally {
            await visitor.close();
        }
    });

    test('S8: a signed-in user opening Register sees the completion page', async ({asUser}) => {
        // A Reader/Author account: the three journal-level links, not the form
        // (Rules 4, 10).
        const alexPage = await (await asUser('author.alex')).newPage();
        await alexPage.goto(`/index.php/${JOURNAL}/user/register`);
        const alexComplete = new RegistrationCompletePage(alexPage);
        await alexComplete.expectOpen();
        await expect(alexPage.locator('form#register')).toHaveCount(0);
        await alexComplete.expectLinks(['Make a New Submission', 'Edit My Profile', 'Continue Browsing']);

        // A Section Editor sees "View Submissions" as well.
        const anaPage = await (await asUser('sectioneditor.ana')).newPage();
        await anaPage.goto(`/index.php/${JOURNAL}/user/register`);
        const anaComplete = new RegistrationCompletePage(anaPage);
        await anaComplete.expectOpen();
        await anaComplete.expectLinks([
            'View Submissions',
            'Make a New Submission',
            'Edit My Profile',
            'Continue Browsing',
        ]);

        // The site-level address answers with two links, whoever the user is.
        await anaPage.goto('/index.php/index/user/register');
        await anaComplete.expectOpen();
        await anaComplete.expectLinks(['Edit My Profile', 'Continue Browsing']);
    });
});
