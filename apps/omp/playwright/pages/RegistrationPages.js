/**
 * @file playwright/pages/RegistrationPages.js
 *
 * OMP page objects for U02 — Registration & account validation: the
 * press-level and site-level "Register" form (form#register), the
 * "Registration complete" page, and the profile's Roles tab (where a new
 * account's roles and reviewing interests are read back).
 *
 * Selectors follow lib/pkp/templates/frontend/pages/userRegister.tpl,
 * frontend/components/registrationForm.tpl, registrationFormContexts.tpl,
 * userRegisterComplete.tpl and lib/pkp/templates/user/userGroups.tpl.
 */
const {BasePage} = require('../../../../shared/playwright/pages/BasePage.js');

exports.RegisterPage = class RegisterPage extends BasePage {
    constructor(page) {
        super(page);
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
        // Press-level consent + opt-ins (fieldset.consent / fieldset.reviewer).
        this.privacyConsent = this.form.locator('input[name="privacyConsent"]');
        this.emailConsent = this.form.locator('input[name="emailConsent"]');
        this.reviewerOptin = this.form.locator('#reviewerOptinGroup input[type="checkbox"]');
        this.reviewerInterests = this.form.locator('#reviewerInterests');
        this.interests = this.form.locator('input#interests');
        // Site-level: the presses list and the site's own consent box.
        this.contextsLegend = this.form.getByText(
            'Which presses on this site would you like to register with?'
        );
        this.siteConsent = this.form.locator(
            ':scope > .fields .optin-privacy input[type="checkbox"]'
        );
        // Spam check (only on the validation-variant server).
        this.altchaWidget = this.form.locator('altcha-widget');
        this.submitButton = this.form.getByRole('button', {name: 'Register', exact: true});
        this.loginLink = this.form.getByRole('link', {name: 'Login', exact: true});
        this.errorsHeading = page.locator('#formErrors .pkp_form_error');
        this.errorLines = page.locator('#formErrors li');
    }

    /** Press-level Register address (Rule 1); scratch presses are single-locale. */
    static contextUrl(contextPath) {
        return `/index.php/${contextPath}/user/register`;
    }

    /** Site-level Register address (Rule 1). */
    static siteUrl() {
        return '/index.php/index/user/register';
    }

    /**
     * Fill the "Profile" and "Login" sections.
     *
     * @param {{givenName: string, familyName?: string, affiliation?: string, country?: string, email: string, username: string, password: string, password2?: string}} values
     */
    async fillIdentity({
        givenName,
        familyName = 'Tester',
        affiliation = 'Public Knowledge Project',
        country = 'Iceland',
        email,
        username,
        password,
        password2 = password,
    }) {
        await this.givenName.fill(givenName);
        await this.familyName.fill(familyName);
        await this.affiliation.fill(affiliation);
        await this.country.selectOption({label: country});
        await this.email.fill(email);
        await this.username.fill(username);
        await this.password.fill(password);
        await this.password2.fill(password2);
    }

    /** The site-level block for one press (li.context), by the press's name. */
    contextBlock(name) {
        return this.form.locator('li.context').filter({
            has: this.page.locator('.name', {hasText: name}),
        });
    }

    /** A role box inside a press's site-level block. */
    contextRoleBox(name, role) {
        return this.contextBlock(name).getByRole('checkbox', {name: role, exact: true});
    }

    /** The per-press consent line inside a press's site-level block. */
    contextConsent(name) {
        return this.contextBlock(name).locator('input[name^="privacyConsent"]');
    }

    async submit() {
        await this.submitButton.click();
    }
};

exports.RegistrationCompletePage = class RegistrationCompletePage extends BasePage {
    constructor(page) {
        super(page);
        this.heading = page.getByRole('heading', {name: 'Registration complete'});
        this.instructions = page.getByText(
            'Thanks for registering! What would you like to do next?'
        );
        this.actions = page.locator('ul.registration_complete_actions');
        this.viewSubmissions = this.actions.getByRole('link', {name: 'View Submissions'});
        this.newSubmission = this.actions.getByRole('link', {name: 'Make a New Submission'});
        this.editProfile = this.actions.getByRole('link', {name: 'Edit My Profile'});
        this.continueBrowsing = this.actions.getByRole('link', {name: 'Continue Browsing'});
    }
};

/** The profile page's "Roles" tab (form#rolesForm, fieldset#userGroups). */
exports.ProfileRolesTab = class ProfileRolesTab extends BasePage {
    constructor(page) {
        super(page);
        this.tab = page.getByRole('tab', {name: 'Roles'});
        this.form = page.locator('form#rolesForm');
        this.userGroups = this.form.locator('#userGroups');
        // Press-level profile: the current press's own role list comes first;
        // the other presses are folded under "Register with other presses".
        this.currentContextRoles = this.userGroups.locator('ul.checkbox_and_radiobutton').first();
        this.checkedBoxes = this.userGroups.locator('input[type="checkbox"]:checked');
        this.interestChips = this.form.locator('#interests li.tagit-choice .tagit-label');
    }

    /** Open the tab from the profile at `contextPath` (`index` = site level). */
    async open(contextPath) {
        await this.page.goto(`/index.php/${contextPath}/user/profile`);
        await this.tab.click();
        await this.userGroups.waitFor({state: 'visible', timeout: 20_000});
    }

    /** A role box in the current press's own list. */
    currentContextBox(role) {
        return this.currentContextRoles.getByRole('checkbox', {name: role, exact: true});
    }

    /** Site-level profile: one press's section, by name. */
    contextSection(name) {
        return this.userGroups.locator('.section').filter({
            has: this.page.locator('label', {hasText: name}),
        });
    }

    contextBox(name, role) {
        return this.contextSection(name).getByRole('checkbox', {name: role, exact: true});
    }
};
