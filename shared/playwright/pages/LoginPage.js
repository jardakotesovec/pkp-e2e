/**
 * @file lib/pkp/playwright/pages/LoginPage.js
 *
 * The site login form (form#login). Stable-ID selectors.
 *
 * The password input ships maxlength="32" while the sectioneditor.* roster
 * passwords run 34–36 chars — fillPassword() lifts the attribute so specs
 * never see the truncation. (The underlying UI limitation is a product
 * finding for the Login & sessions spec, not something to assert around.)
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');

exports.LoginPage = class LoginPage extends BasePage {
    constructor(page) {
        super(page);
        this.usernameInput = page.locator('input#username');
        this.passwordInput = page.locator('input#password');
        this.submitButton = page.locator('form#login button[type="submit"]');
        this.form = page.locator('form#login');
        this.rememberMeCheckbox = page.locator('form#login input[name="remember"]');
        this.forgotPasswordLink = page.getByRole('link', {name: 'Forgot your password?'});
    }

    async goto() {
        await this.page.goto(this.siteUrl('/en/login'));
    }

    /**
     * A context's own Login page (`/index.php/{contextPath}/login`), which
     * decides where the user lands (Rule 3 of U01).
     *
     * @param {string} contextPath
     */
    async gotoContext(contextPath) {
        await this.page.goto(this.contextUrl(contextPath, '/login'));
    }

    /** The form is on screen (the signed-out answer to a private address). */
    async expectForm() {
        await expect(this.form).toBeVisible();
    }

    /**
     * Tick or untick "Keep me logged in".
     *
     * @param {boolean} on
     */
    async setRememberMe(on) {
        await this.rememberMeCheckbox.setChecked(on);
    }

    /**
     * Fill both boxes and press the button without waiting for a redirect,
     * for a submission expected to stay on the page (a wrong password).
     *
     * @param {string} username
     * @param {string} password
     */
    async submitCredentials(username, password) {
        await this.usernameInput.fill(username);
        await this.fillPassword(password);
        await this.submitButton.click();
    }

    /**
     * @param {string} password
     */
    async fillPassword(password) {
        await this.passwordInput.evaluate((el) => el.removeAttribute('maxlength'));
        await this.passwordInput.fill(password);
    }

    /**
     * Submit the form and wait for the redirect away from /login.
     * `waitUntil: 'commit'` fires on URL change rather than waiting for the
     * dashboard's XHR fan-out (fragile under parallel load).
     *
     * @param {string} username
     * @param {string} password
     */
    async signIn(username, password) {
        await this.usernameInput.fill(username);
        await this.fillPassword(password);
        await this.submitButton.click();
        await this.page.waitForURL((url) => !url.pathname.includes('/login'), {
            timeout: 15_000,
            waitUntil: 'commit',
        });
    }
};
