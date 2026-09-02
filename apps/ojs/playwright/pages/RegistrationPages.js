/**
 * @file playwright/pages/RegistrationPages.js
 *
 * OJS-local Page Objects for registration & account validation (spec:
 * docs/specs/U02-registration-and-account-validation.md).
 *
 * Surfaces:
 * - RegisterPage — the "Register" form, journal-level ({journal}/user/register)
 *   or site-level (index/user/register), on any server (the fixed
 *   validation-variant server included, via an absolute origin).
 * - RegistrationCompletePage — the "Registration complete" landing.
 * - ProfileRolesTab — the profile's Roles tab (journal- or site-level).
 * - siteHeader(page) — the front-end user navigation (#navigationUser).
 *
 * Labels are the live locale strings (lib/pkp/locale/en/user.po).
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('../../../../shared/playwright/pages/BasePage.js');

/** The front-end user navigation: "Register" / "Login" or the username menu. */
function siteHeader(page) {
    return page.locator('#navigationUser');
}

exports.siteHeader = siteHeader;

exports.RegisterPage = class RegisterPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string|null} contextPath journal path, or null for the site-level page
     * @param {{origin?: string}} [options] absolute origin (the variant server); default: baseURL
     */
    constructor(page, contextPath, {origin = ''} = {}) {
        super(page);
        this.contextPath = contextPath;
        this.origin = origin;
        this.form = page.locator('form#register');
        this.heading = page.getByRole('heading', {name: 'Register', exact: true});
        this.givenName = this.form.locator('input[name="givenName"]');
        this.familyName = this.form.locator('input[name="familyName"]');
        this.affiliation = this.form.locator('input[name="affiliation"]');
        this.country = this.form.locator('select[name="country"]');
        this.email = this.form.locator('input[name="email"]');
        this.username = this.form.locator('input[name="username"]');
        this.password = this.form.locator('input[name="password"]');
        this.password2 = this.form.locator('input[name="password2"]');
        // Journal-level consent and opt-in boxes.
        this.privacyConsent = this.form.locator('input[name="privacyConsent"]');
        this.emailConsent = this.form.locator('input[name="emailConsent"]');
        this.privacyStatementLink = this.form.getByRole('link', {name: 'privacy statement'});
        // The reviewer offer (one box on a default journal) and its interests.
        this.reviewerOptin = this.form.locator('#reviewerOptinGroup input[type="checkbox"]');
        this.reviewerInterests = this.form.locator('#reviewerInterests');
        this.interests = this.form.locator('input#interests');
        // Site-level: the journal list and the site-wide consent box.
        this.contextsLegend = this.form.getByText(
            'Which journals on this site would you like to register with?'
        );
        this.siteConsent = this.form.locator('input[name="privacyConsent[0]"]');
        this.submitButton = this.form.locator('button.submit');
        this.loginLink = this.form.getByRole('link', {name: 'Login', exact: true});
        this.errors = page.locator('#formErrors');
        this.errorLines = page.locator('#formErrors li');
    }

    /** The page's own address (Rule 1), typed as a visitor would. */
    url() {
        const path = this.contextPath
            ? this.contextUrl(this.contextPath, '/user/register')
            : this.siteUrl('/user/register');
        return `${this.origin}${path}`;
    }

    async goto() {
        await this.page.goto(this.url());
    }

    async expectForm() {
        await expect(this.heading).toBeVisible();
        await expect(this.form).toBeVisible();
    }

    /** The "Profile" section. */
    async fillProfile({givenName = 'Test', familyName = 'Registrant', affiliation = 'PKP', country = 'Canada'} = {}) {
        await this.givenName.fill(givenName);
        await this.familyName.fill(familyName);
        await this.affiliation.fill(affiliation);
        await this.country.selectOption({label: country});
    }

    /** The "Login" section. `password2` defaults to `password`. */
    async fillLogin({email, username, password, password2 = password}) {
        await this.email.fill(email);
        await this.username.fill(username);
        await this.password.fill(password);
        await this.password2.fill(password2);
    }

    /** A site-level journal block, by the journal's name. */
    contextBlock(journalName) {
        return this.form.locator('li.context').filter({
            has: this.page.locator('.name', {hasText: journalName}),
        });
    }

    /** The per-journal consent line inside a site-level block. */
    contextConsent(block) {
        return block.locator('.context_privacy');
    }

    /**
     * Press "Register" on a server where the ALTCHA spam check is on. The
     * widget verifies in the browser on submit and posts the form itself
     * (spec, "Spam check"), so the only thing to wait for at the source is the
     * widget's script being live before the press.
     */
    async submitWithSpamCheck() {
        await expect(this.form.locator('altcha-widget')).toHaveCount(1);
        await this.page.waitForFunction(() => !!customElements.get('altcha-widget'), undefined, {
            timeout: 30_000,
        });
        await this.submitButton.click();
    }

    /**
     * Assert the refusal list: "Errors occurred processing this form:" then
     * exactly these lines, in this order.
     *
     * @param {string[]} lines
     */
    async expectErrors(lines) {
        await expect(this.errors).toContainText('Errors occurred processing this form:');
        await expect(this.errorLines).toHaveText(lines);
    }
};

exports.RegistrationCompletePage = class RegistrationCompletePage extends BasePage {
    constructor(page) {
        super(page);
        this.heading = page.getByRole('heading', {name: 'Registration complete'});
        this.instructions = page.getByText('Thanks for registering! What would you like to do next?');
        this.actions = page.locator('ul.registration_complete_actions');
    }

    async expectOpen() {
        await expect(this.heading).toBeVisible();
        await expect(this.instructions).toBeVisible();
    }

    link(name) {
        return this.actions.getByRole('link', {name, exact: true});
    }

    /** Assert exactly these links, in order. */
    async expectLinks(names) {
        await expect(this.actions.getByRole('link')).toHaveText(names);
    }
};

exports.ProfileRolesTab = class ProfileRolesTab extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string|null} contextPath journal path, or null for the site-level profile
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.form = page.locator('form#rolesForm');
        this.tab = page.locator('#profileTabs').getByRole('tab', {name: 'Roles', exact: true});
        this.interestChips = this.form.locator('#interests ul.interests .tagit-label');
    }

    /** Open the profile and switch to the Roles tab (jQuery UI tabs, AJAX-loaded). */
    async goto() {
        const path = this.contextPath
            ? this.contextUrl(this.contextPath, '/user/profile')
            : this.siteUrl('/user/profile');
        await this.page.goto(path);
        await this.open();
    }

    /** From the profile page (e.g. after "Edit My Profile"), select the Roles tab. */
    async open() {
        await expect(this.page.getByRole('heading', {name: 'Profile', exact: true})).toBeVisible();
        await this.tab.click();
        await expect(this.form).toBeVisible();
    }

    /**
     * A role box of the current journal. The journal-level tab renders the
     * current journal's roles as the form's first section and folds the other
     * journals under "Register with other journals" after it (their boxes
     * carry the same labels), so the lookup is scoped to that first section.
     */
    roleBox(name) {
        const scope = this.contextPath ? this.form.locator('.section').first() : this.form;
        return scope.getByRole('checkbox', {name, exact: true});
    }

    /** The site-level form's block for one journal (sections titled by journal name). */
    journalSection(journalName) {
        return this.form.locator('.section').filter({
            has: this.page.locator('label', {hasText: journalName}),
        });
    }
};
