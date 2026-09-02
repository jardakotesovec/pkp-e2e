/**
 * @file playwright/pages/RegistrationPages.js
 *
 * OPS feature POMs for the registration suite (U2).
 *
 * Surfaces:
 * - RegisterPage — the server-level ({server}/user/register) and site-level
 *   (index/user/register) "Register" form: the "Profile" and "Login"
 *   fieldsets, the consent and opt-in boxes, the site-level server blocks,
 *   the error list and the "Register" button.
 * - RegistrationCompletePage — the "Registration complete" landing.
 * - ProfileRolesTab — the profile's Roles tab (user/profile → "Roles"), read
 *   through its self-registration checkboxes.
 * - ServerSettingsPages — the three manager screens this feature's
 *   scenarios drive on a scratch server: Settings › Server › Contact
 *   (technical support contact), Settings › Users & Roles › Site Access
 *   Options (close registration) and Settings › Website › Setup › Privacy
 *   Statement (empty the statement).
 *
 * Selector sources: lib/pkp/templates/frontend/pages/userRegister.tpl,
 * frontend/components/registrationForm.tpl, registrationFormContexts.tpl,
 * userRegisterComplete.tpl, common/formErrors.tpl, user/profile.tpl,
 * user/userGroups.tpl; the Vue settings forms PKPContactForm ('contact'),
 * PKPUserAccessForm ('userAccess') and PKPPrivacyForm ('privacy').
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('../../../../shared/playwright/pages/BasePage.js');

exports.RegisterPage = class RegisterPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        super(page);
        this.form = page.locator('form#register');
        this.heading = page.getByRole('heading', {name: 'Register', exact: true});
        this.givenNameInput = this.form.locator('input#givenName');
        this.familyNameInput = this.form.locator('input#familyName');
        this.affiliationInput = this.form.locator('input#affiliation');
        this.countrySelect = this.form.locator('select#country');
        this.emailInput = this.form.locator('input#email');
        this.usernameInput = this.form.locator('input#username');
        this.passwordInput = this.form.locator('input#password');
        this.password2Input = this.form.locator('input#password2');
        // Server-level consent (the site-level page has one box per server,
        // see contextBlock(), plus the site's own when the site has a statement).
        this.privacyConsentBox = this.form.locator('input[name="privacyConsent"]');
        this.privacyStatementLink = this.form.locator('.optin-privacy a', {hasText: 'privacy statement'});
        this.emailConsentBox = this.form.locator('input[name="emailConsent"]');
        // {OJS OMP} — the reviewer offer; on a preprint server these never render.
        this.reviewerFieldset = this.form.locator('fieldset.reviewer');
        this.reviewerBoxes = this.form.locator('input[name^="reviewerGroup"]');
        this.reviewerInterestsInput = this.form.locator('#reviewerInterests input#interests');
        // Site-level only.
        this.contextsLegend = this.form.locator('fieldset[name="contexts"] > legend');
        // The site's own consent box (SITE_CONTEXT_ID renders as 0).
        this.siteConsentBox = this.form.locator('input[name="privacyConsent[0]"]');
        this.registerButton = this.form.getByRole('button', {name: 'Register', exact: true});
        this.loginLink = this.form.locator('a.login');
        this.errorBox = page.locator('#formErrors');
        this.errorLines = page.locator('#formErrors ul.pkp_form_error_list li');
        // ALTCHA (validation-variant server only): the widget's state holder.
        this.altchaState = this.form.locator('altcha-widget .altcha[data-state]');
    }

    /**
     * @param {string} contextPath a server path, or 'index' for the site-level page
     */
    async goto(contextPath) {
        await this.page.goto(this.contextUrl(contextPath, '/user/register'));
    }

    /**
     * Fill the "Profile" and "Login" fieldsets. Any key left out is left as is.
     *
     * @param {{givenName?: string, familyName?: string, affiliation?: string, country?: string, email?: string, username?: string, password?: string, password2?: string}} values
     */
    async fill(values) {
        if (values.givenName !== undefined) await this.givenNameInput.fill(values.givenName);
        if (values.familyName !== undefined) await this.familyNameInput.fill(values.familyName);
        if (values.affiliation !== undefined) await this.affiliationInput.fill(values.affiliation);
        if (values.country !== undefined) await this.countrySelect.selectOption({label: values.country});
        if (values.email !== undefined) await this.emailInput.fill(values.email);
        if (values.username !== undefined) await this.usernameInput.fill(values.username);
        if (values.password !== undefined) await this.passwordInput.fill(values.password);
        if (values.password2 !== undefined) await this.password2Input.fill(values.password2);
    }

    /**
     * A site-level server block under "Which servers on this site would you
     * like to register with?", by the server's displayed name.
     *
     * @param {string} name
     */
    contextBlock(name) {
        return this.form.locator('li.context').filter({
            has: this.page.locator('.name', {hasText: name}),
        });
    }

    /** The "Reader" box of a site-level server block. */
    readerBox(name) {
        return this.contextBlock(name).getByRole('checkbox', {name: 'Reader', exact: true});
    }

    /** The per-server consent line of a site-level server block. */
    contextConsentBox(name) {
        return this.contextBlock(name).locator('input[name^="privacyConsent"]');
    }

    /** The per-server consent line wrapper (off-screen until a role is ticked). */
    contextConsentLine(name) {
        return this.contextBlock(name).locator('.context_privacy');
    }

    /** Press "Register". Waits for nothing — the caller asserts the outcome. */
    async submit() {
        await this.registerButton.click();
    }

    /**
     * Press "Register" on a page guarded by ALTCHA (the validation-variant
     * server). The floating widget intercepts the submit, verifies in the
     * browser and re-submits with its hidden `altcha` field, so the wait is
     * on the browser's own POST carrying that field — the proof the widget
     * reached "Verified" before the form went through.
     */
    async submitThroughAltcha() {
        await expect(this.altchaState).toHaveAttribute('data-state', 'unverified');
        const verifiedPost = this.page.waitForRequest(
            (request) =>
                request.method() === 'POST' &&
                request.url().includes('/user/register') &&
                /(^|&)altcha=[^&]+/.test(request.postData() || '')
        );
        await this.registerButton.click();
        await verifiedPost;
    }
};

exports.RegistrationCompletePage = class RegistrationCompletePage extends BasePage {
    constructor(page) {
        super(page);
        this.heading = page.getByRole('heading', {name: 'Registration complete', exact: true});
        this.instructions = page.getByText('Thanks for registering! What would you like to do next?');
        this.actions = page.locator('ul.registration_complete_actions');
        this.viewSubmissionsLink = this.actions.getByRole('link', {name: 'View Submissions', exact: true});
        this.newSubmissionLink = this.actions.getByRole('link', {name: 'Make a New Submission', exact: true});
        this.editProfileLink = this.actions.getByRole('link', {name: 'Edit My Profile', exact: true});
        this.continueBrowsingLink = this.actions.getByRole('link', {name: 'Continue Browsing', exact: true});
    }

    async expectShown() {
        await expect(this.heading).toBeVisible();
        await expect(this.instructions).toBeVisible();
    }

    /**
     * Assert the exact set of action links, in DOM order.
     *
     * @param {string[]} names
     */
    async expectActions(names) {
        await expect(this.actions.getByRole('link')).toHaveText(names);
    }
};

exports.ProfileRolesTab = class ProfileRolesTab extends BasePage {
    constructor(page) {
        super(page);
        this.tab = page.getByRole('tab', {name: 'Roles', exact: true});
        this.form = page.locator('form#rolesForm');
        this.roleBoxes = this.form.locator(
            'input[type="checkbox"][name^="readerGroup"], input[type="checkbox"][name^="authorGroup"], input[type="checkbox"][name^="reviewerGroup"]'
        );
        // The server-level tab folds the other servers under "Register with
        // other servers"; the boxes outside that drawer are this server's.
        this.ownContextBoxes = this.form.locator(
            'xpath=.//input[@type="checkbox" and (starts-with(@name, "readerGroup") or starts-with(@name, "authorGroup") or starts-with(@name, "reviewerGroup")) and not(ancestor::div[@id="userGroupExtraFormFields"])]'
        );
    }

    /**
     * Open the profile of the given scope and switch to the Roles tab.
     *
     * @param {string} contextPath a server path, or 'index' for the site-level profile
     */
    async goto(contextPath) {
        await this.page.goto(this.contextUrl(contextPath, '/user/profile'));
        await this.tab.click();
        await expect(this.roleBoxes.first()).toBeVisible({timeout: 20_000});
    }

    /** A role box of this server (outside the other-servers drawer), by label. */
    ownBox(label) {
        return this.ownContextBoxes.and(
            this.form.getByRole('checkbox', {name: label, exact: true})
        );
    }

    /**
     * The site-level Roles tab lists every server flat, one fbv section per
     * server titled with its name: that section's boxes.
     *
     * @param {string} contextName
     */
    contextSection(contextName) {
        const exact = new RegExp(`^\\s*${contextName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
        return this.form.locator('div.section').filter({
            has: this.page.locator('ul.checkbox_and_radiobutton > label', {hasText: exact}),
        });
    }
};

exports.ServerSettingsPages = class ServerSettingsPages extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    /**
     * The save of a context settings form: a PUT to /api/v1/contexts/{id},
     * which useFetch tunnels as POST + X-Http-Method-Override (patterns.md).
     */
    waitForContextSave() {
        return this.page.waitForResponse(
            (r) =>
                r.url().includes('/api/v1/contexts/') &&
                ['PUT', 'POST'].includes(r.request().method()) &&
                r.ok()
        );
    }

    /**
     * Settings › Server › Contact: fill the "Technical Support Contact"
     * name and email and save.
     */
    async setTechnicalSupportContact({name, email}) {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/context'));
        await this.page.locator('#contact-button').click();
        const nameInput = this.page.locator('#contact-supportName-control');
        await expect(nameInput).toBeVisible({timeout: 20_000});
        await nameInput.fill(name);
        await this.page.locator('#contact-supportEmail-control').fill(email);
        const saved = this.waitForContextSave();
        await this.page
            .locator('form')
            .filter({has: nameInput})
            .getByRole('button', {name: 'Save', exact: true})
            .click();
        const response = await saved;
        const body = await response.json();
        expect(body.supportEmail).toBe(email);
    }

    /**
     * Settings › Users & Roles › Site Access Options: choose "The Server
     * Manager will register all user accounts." and save (Rule 2).
     */
    async closeRegistration() {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/access'));
        await this.page.locator('#access-button').click();
        const closed = this.page.getByRole('radio', {
            name: 'The Server Manager will register all user accounts.',
        });
        await expect(closed).toBeVisible({timeout: 20_000});
        await closed.check();
        const saved = this.waitForContextSave();
        await this.page
            .locator('form')
            .filter({has: closed})
            .getByRole('button', {name: 'Save', exact: true})
            .click();
        const response = await saved;
        const body = await response.json();
        expect(body.disableUserReg).toBe(true);
    }

    /**
     * Settings › Website › Setup › Privacy Statement: empty the rich-text
     * statement the way a person would (select all, delete) and save.
     */
    async clearPrivacyStatement() {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/website'));
        await this.page.locator('#setup-button').click();
        await this.page.locator('#privacy-button').click();
        const editorId = 'privacy-privacyStatement-control-en';
        await this.page.waitForFunction(
            (id) => !!window.tinymce?.get(id)?.initialized,
            editorId,
            {timeout: 30_000}
        );
        const editorField = this.page.locator(`#${editorId}`);
        const body = this.page
            .locator('.pkpFormField')
            .filter({has: editorField})
            .frameLocator('iframe')
            .first()
            .locator('body');
        await body.click();
        await this.page.keyboard.press('ControlOrMeta+A');
        await this.page.keyboard.press('Backspace');
        const saved = this.waitForContextSave();
        await this.page
            .locator('form')
            .filter({has: editorField})
            .getByRole('button', {name: 'Save', exact: true})
            .click();
        const response = await saved;
        const saveBody = await response.json();
        const statement = saveBody.privacyStatement?.en ?? '';
        expect(statement.replace(/<[^>]+>|&nbsp;|\s/g, '')).toBe('');
        await expect(this.page.locator('[role="status"]').filter({hasText: 'Saved'})).toBeVisible();
    }
};
