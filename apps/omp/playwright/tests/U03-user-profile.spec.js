// @ts-check
/**
 * @file playwright/tests/U03-user-profile.spec.js
 *
 * User profile — OMP suite, one test per canonical scenario the spec runs on
 * a press (scenarios 1–10, read with the spec's press vocabulary; the
 * press-specific fact OMP1 is asserted inside S6, and the spec lists no
 * OMP-only scenario).
 * Spec: docs/specs/U03-user-profile.md
 *
 * Deliberately NOT covered (one line per omission, citing the register ID or
 * rule):
 * - A1 🐞 (a site-level address naming a tab lands on Identity for a
 *   one-press user): every test opens the press-level page; the site-level
 *   profile of Rule 3 is not driven.
 * - A2 🐞 (a refused oversize .gif wipes the existing image): S7 uploads
 *   one accepted .png only; no refusal is driven.
 * - A3 🐞 / A10 🐞 (site-level email change: dead "reject" link, "Array"
 *   sign-off): site-level requests are not driven.
 * - A4 🐞 (a press closed to registrations keeps an empty section on the
 *   Roles tab): the Site Access Options setting is not touched.
 * - A5 ❓ (the scheduled-role banner ignores which press is open) and Rule
 *   13: a dated role invitation is the user-invitations feature's surface.
 * - A6 ❓ (a self-service box also drops a Press Manager's assignment,
 *   locking an author out of My Submissions): S6 ticks and unticks a role
 *   the user took themselves and never asserts the lock-out.
 * - A7 🐞 (the Password tab's 32-character cap): scratch passwords stay
 *   short; the cap is asserted neither way.
 * - A8 ❓ (the confirmation goes to the old address): S4 reads the message
 *   where the app delivers it and asserts the new address received nothing
 *   only as the scenario states it; which mailbox should confirm is open.
 * - A9 ❓ (the image is shown nowhere public) and Rule 9d: no reader-facing
 *   page (catalog entry) is opened; seed-facts also says the picture never
 *   renders on the test installs, so S7 asserts the "Delete" button, never
 *   the picture.
 * - A11 🐞 (a stale error notice survives a successful password change):
 *   S8 asserts the saved toast after the earlier refusals, never the notice.
 * - A12 🐞 (the Password tab's "Cancel" does nothing): not pressed.
 * - A13 ❓ / A16 ❓ (the preferred public name and a verified ORCID do not
 *   reach a new submission's first contributor) and Rule 7's contributor
 *   copy: the submission wizard's surface; not driven here.
 * - A14 🐞 (the site-level privacy link is dead): the link is asserted
 *   present on every tab (S1) and never opened.
 * - A15 🐞 ("Please enter a valid URL." outlives the corrected save): S7
 *   asserts the refusal, then the saved toast, never the stale sentence.
 * - OMP1 ✅ is asserted as the press's box set in S6 ("Reader", "Author",
 *   "Chapter Author", "External Reviewer"; the equality also covers the
 *   absent "Internal Reviewer"); the Internal Reviewer role's own
 *   self-registration flag (Settings › Users & Roles › Roles) is not
 *   changed, so the "closed to self-registration" side is not driven.
 * - Rule 6f (a request lapses after the invitation lifetime): a clock, not a
 *   screen, settles it; Rule 7's "Working Languages" on a one-language site
 *   (a site-wide change) and the masthead affiliation; Rule 8d's Add
 *   Reviewer search (U27's surface); Rule 10a's compromised-password refusal
 *   (a site-settings singleton, PRINCIPLES A7/A9); Rule 12d (no API secret:
 *   a config state with no screen, PRINCIPLES D9); the audit lines and the
 *   Notifications tab's meaning (*Notifications center*): rule details
 *   outside the canonical scenarios; not covered.
 * - Fields: the Identity tab's second-language boxes (French is not a form
 *   language on the fleets, seed-facts) and the family-name-without-given-
 *   name refusal; the Contact tab's Signature and Mailing Address; the
 *   Phone cut at 24 characters: not canonical scenarios; not covered.
 *
 * Isolation: every account that changes is a throwaway user in a scratch
 * press seeded through the scenario endpoint (unique tags naming the app);
 * the roster and `publicknowledge` are only read (S1). Scenario 10 runs as
 * a scratch press's own Press Manager rather than `manager.maya`, so no
 * seeded user's notification choices are touched (PRINCIPLES A7). Every
 * sign-in happens in the test's own fresh browser context through the real
 * Login form, never through the shared .auth cache, because a password
 * change ends the account's other sessions and a sign-out ends the cached
 * one; the only cached identity used is `admin` (a scratch press's
 * auto-enrolled Press Manager) for the Users & Roles reads. Mailpit reads
 * are scoped by the throwaway recipient (PRINCIPLES A8) and every silence
 * claim has a positive control. A refused image upload raises a browser
 * alert (Rule 9a), so S7 registers a dialog handler before its upload. No
 * hard-coded waits.
 */
const path = require('path');
const {test, expect} = require('../support/fixtures.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {
    ProfilePage,
    SAVED_MESSAGE,
    userNav,
    openUserNav,
} = require('../../../../shared/playwright/pages/ProfilePage.js');
const {UsersAccessPage} = require('../pages/UserInvitationPages.js');
const {getPassword, getEmail} = require('../../../../shared/playwright/data/users.js');

const PRESS = 'publicknowledge';
const REQUIRED = 'This field is required.';
const EMAIL_TAKEN = 'The selected email address is already in use by another user.';
const URL_INVALID = 'Please enter a valid URL.';
const CURRENT_PASSWORD_WRONG = 'The current password you entered was incorrect.';
const PASSWORDS_MISMATCH = 'The passwords do not match.';
const PASSWORD_SAME_AS_OLD = 'Your new password is the same as your old password.';
const ERRORS_HEADING = 'Errors occurred processing this form';
const LOGIN_ERROR = 'Invalid username/email or password. Please try again.';
const CHANGE_EMAIL_SUBJECT = 'Confirm account contact email change request';
const OTHER_PRESSES = 'Register with other presses';
/** The press's self-service boxes, in the tab's order (Rule 8a, OMP1). */
const PRESS_ROLE_BOXES = ['Reader', 'Author', 'Chapter Author', 'External Reviewer'];
const NOTIFICATIONS_INTRO =
    'Select the system events that you wish to be notified about. Unchecking an item will prevent notifications of the event from showing up in the system and also from being emailed to you. Checked events will appear in the system and you have an extra option to receive or not the same notification by email.';
const NOTIFICATION_GROUPS = ['Public Announcements', 'Submission Events', 'Reviewing Events', 'Editors'];
const API_KEY_GENERATE_NOTE = 'Generating a new API key will invalidate any existing key for this user.';
const API_KEY_REMOVE_NOTE = 'Deleting a key will revoke access to any application that uses it.';
const IMAGE_FIXTURE = path.resolve(__dirname, '../fixtures/files/profile-image-400.png');

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u03${scenario}ompw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A fresh, explicitly-anonymous context (never inherits cached storage state). */
async function anonContext(browser, baseURL) {
    return browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
}

/**
 * Fresh UI login on a press's Login page, in its own context. Used for
 * every actor whose session this suite may end (sign-out, password change),
 * so the shared .auth cache is never poisoned.
 */
async function freshLogin(browser, baseURL, contextPath, username, password = getPassword(username)) {
    const context = await anonContext(browser, baseURL);
    const page = await context.newPage();
    await page.goto(`/index.php/${contextPath}/login`);
    const loginPage = new LoginPage(page);
    await loginPage.signIn(username, password);
    return {context, page};
}

/** Sign out through the user menu's "Logout" and wait for the Login page. */
async function signOut(page) {
    await openUserNav(page);
    await userNav(page).getByRole('link', {name: 'Logout', exact: true}).click();
    await page.waitForURL(/\/login/, {waitUntil: 'commit', timeout: 30_000});
    await expect(page.locator('form#login')).toBeVisible();
}

/** Attempt a sign-in on a press's Login page and expect the generic refusal. */
async function expectSignInRefused(browser, baseURL, contextPath, username, password) {
    const context = await anonContext(browser, baseURL);
    try {
        const page = await context.newPage();
        await page.goto(`/index.php/${contextPath}/login`);
        const loginPage = new LoginPage(page);
        await loginPage.usernameInput.fill(username);
        await loginPage.fillPassword(password);
        await loginPage.submitButton.click();
        await expect(page.getByText(LOGIN_ERROR)).toBeVisible();
    } finally {
        await context.close();
    }
}

/**
 * Count the tab-save POSTs a page sends from now on: the "nothing is sent"
 * claims of a browser-side refusal read this after the refusal shows, and
 * the same test's later save (awaited through `ProfilePage.save()`) is the
 * positive control.
 */
function countSaves(page) {
    const counter = {count: 0};
    page.on('request', (request) => {
        if (request.method() === 'POST' && /\/profile-tab\/save-/.test(request.url())) {
            counter.count += 1;
        }
    });
    return counter;
}

/**
 * Users & Roles (Users tab) of a scratch press, as its auto-enrolled Press
 * Manager `admin`. The search is bounded by the list's own response to the
 * username, so the row read after it is current (PRINCIPLES M4).
 */
async function usersRolesRow(adminPage, contextPath, username, email) {
    const usersAccess = new UsersAccessPage(adminPage, contextPath);
    await usersAccess.goto();
    await usersAccess.searchUsers(username);
    const row = usersAccess.userRow(email);
    await expect(row).toBeVisible({timeout: 30_000});
    return row;
}

/** Pull the emailed "confirm" and "reject" links out of one change-email message. */
async function changeEmailLinks(pkpMail, summary) {
    const full = await pkpMail.fullMessage(summary.ID);
    const confirm = pkpMail.extractLink(full.HTML, /confirm/i);
    const reject = pkpMail.extractLink(full.HTML, /reject/i);
    expect(confirm, 'confirm link present in the email').toBeTruthy();
    expect(reject, 'reject link present in the email').toBeTruthy();
    return {full, confirm, reject};
}

/** Request an email change on the open Contact tab (Country chosen first: seed-facts). */
async function requestEmailChange(profile, newEmail) {
    await profile.country().selectOption({label: 'Canada'});
    await profile.email().fill(newEmail);
    await profile.save();
    await expect(profile.pendingEmailNotice()).toBeVisible();
    await expect(profile.email()).toHaveAttribute('readonly', /.*/);
}

test.describe('user profile', () => {
    test('S1: reach the profile and its tabs', {tag: '@smoke'}, async ({browser, baseURL}) => {
        test.slow();
        // Fresh session: the scenario ends with a sign-out, which would kill a
        // cached session for parallel tests.
        const {context, page} = await freshLogin(browser, baseURL, PRESS, 'author.alex');
        try {
            // On an editorial screen (My Submissions), the user menu's "Edit
            // Profile" (Rule 1).
            await page.goto(`/index.php/${PRESS}/dashboard/mySubmissions`);
            await openUserNav(page);
            await userNav(page).getByRole('link', {name: 'Edit Profile', exact: true}).click();
            const profile = new ProfilePage(page, PRESS);
            await profile.expectOpen('identity');
            await expect(page).toHaveURL(/\/user\/profile/);
            await profile.expectSelectedTab('identity');
            await expect(profile.tabs.getByRole('tab')).toHaveText([
                'Identity',
                'Contact',
                'Roles',
                'Public',
                'Password',
                'Notifications',
                'API Key',
            ]);

            // Identity: the username as plain text, the names filled.
            await expect(profile.usernameText()).toContainText('author.alex');
            await expect(profile.givenName()).toHaveValue('Alex');
            await expect(profile.familyName()).toHaveValue('Author');
            await expect(profile.saveButton()).toBeVisible();
            await expect(profile.privacySentence()).toBeVisible();
            await expect(profile.privacyLink()).toBeVisible();

            // Each other tab opens with "Save" and ends with the privacy
            // sentence; the API Key tab has its own button instead.
            for (const tab of ['contact', 'roles', 'public', 'password', 'notifications']) {
                await profile.open(tab);
                await profile.expectSelectedTab(tab);
                await expect(profile.saveButton()).toBeVisible();
                await expect(profile.privacySentence()).toBeVisible();
                await expect(profile.privacyLink()).toBeVisible();
            }
            await profile.open('apiKey');
            await profile.expectSelectedTab('apiKey');
            await expect(profile.saveButton()).toHaveCount(0);
            await expect(
                profile.form('apiKey').getByRole('button', {name: /^(Create API Key|Delete)$/})
            ).toBeVisible();
            await expect(profile.privacySentence()).toBeVisible();
            await expect(profile.privacyLink()).toBeVisible();

            // Copy the address, sign out, paste it back: the Login page, and
            // signing in continues to the profile (Actors row 1).
            const address = page.url();
            await signOut(page);
            await page.goto(address);
            const loginPage = new LoginPage(page);
            await expect(page.locator('form#login')).toBeVisible();
            await loginPage.signIn('author.alex', getPassword('author.alex'));
            await page.waitForURL(/\/user\/profile/, {waitUntil: 'commit', timeout: 30_000});
            await profile.expectOpen('identity');
        } finally {
            await context.close();
        }
    });

    test('S2: rename yourself and change your initials', async ({browser, baseURL, ompApi, asUser}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const username = `${tag}au`;
        const email = `${username}@mail.test`;
        const preferredName = `Dr. Ulla P. ${tag}`;
        await ompApi.createContext({
            tag,
            users: [{username, givenName: 'Ulla', familyName: 'Bergmann', roles: ['author']}],
        });

        const {context, page} = await freshLogin(browser, baseURL, tag, username);
        try {
            const profile = new ProfilePage(page, tag);
            await profile.goto('identity');
            const saves = countSaves(page);

            // An empty given name is refused in the browser: the sentence
            // under the box and nothing sent (Fields Identity).
            await profile.givenName().fill('');
            await profile.saveButton().click();
            await expect(profile.fieldError(REQUIRED)).toBeVisible();
            expect(saves.count).toBe(0);

            // Name back, a display name, two lowercase letters that turn into
            // capitals; a third is not accepted (Rule 5).
            await profile.givenName().fill('Ulla');
            await profile.preferredPublicName().fill(preferredName);
            await profile.avatarInitials().fill('');
            await profile.avatarInitials().pressSequentially('zqx');
            await expect(profile.avatarInitials()).toHaveValue('ZQ');
            await profile.save();
            expect(saves.count).toBe(1);

            // Saved inside the tab only, nothing at the top right (Rule 2).
            await expect(profile.inTabNotice('identity')).toContainText(SAVED_MESSAGE);
            await expect(profile.toast).not.toContainText(SAVED_MESSAGE);

            // After a reload the avatar shows the capitals and the top bar
            // still the username (Rules 4–5).
            await page.reload();
            await profile.expectOpen('identity');
            const avatar = userNav(page).getByRole('button', {name: /^ZQ /});
            await expect(avatar).toBeVisible();
            await expect(avatar).toContainText(username);

            // The Press Manager's Users & Roles lists the preferred name
            // (Rule 4; `admin` is the scratch press's auto-enrolled manager).
            const adminPage = await (await asUser('admin')).newPage();
            const row = await usersRolesRow(adminPage, tag, username, email);
            await expect(row).toContainText(preferredName);

            // Cleared again: the avatar returns to the name's initials.
            await profile.preferredPublicName().fill('');
            await profile.avatarInitials().fill('');
            await profile.save();
            await expect(profile.inTabNotice('identity')).toContainText(SAVED_MESSAGE);
            await page.reload();
            await profile.expectOpen('identity');
            await expect(userNav(page).getByRole('button', {name: /^UB /})).toBeVisible();
            const rowAgain = await usersRolesRow(adminPage, tag, username, email);
            await expect(rowAgain).toContainText('Ulla Bergmann');
            await expect(rowAgain).not.toContainText(preferredName);
        } finally {
            await context.close();
        }
    });

    test('S3: update contact details', async ({browser, baseURL, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const username = `${tag}au`;
        const email = `${username}@mail.test`;
        await ompApi.createContext({
            tag,
            users: [{username, givenName: 'Cora', familyName: 'Contact', roles: ['author']}],
        });

        const {context, page} = await freshLogin(browser, baseURL, tag, username);
        try {
            const profile = new ProfilePage(page, tag);
            await profile.goto('contact');
            const saves = countSaves(page);

            // A blank Country is refused in the browser; nothing is saved
            // (Fields Contact; a seeded user has no country, seed-facts).
            await profile.country().selectOption({value: ''});
            await profile.phone().fill('555-0100');
            await profile.saveButton().click();
            await expect(profile.fieldError(REQUIRED)).toBeVisible();
            expect(saves.count).toBe(0);
            await profile.open('identity');
            await profile.open('contact');
            await expect(profile.phone()).toHaveValue('');

            // Country, phone and affiliation save; reopening shows them (Rule 7).
            await profile.country().selectOption({label: 'Canada'});
            await profile.phone().fill('555-0101');
            await profile.affiliation().fill(`Affiliation ${tag}`);
            await profile.save();
            expect(saves.count).toBe(1);
            await expect(profile.toast).toContainText(SAVED_MESSAGE);
            await profile.open('identity');
            await profile.open('contact');
            await expect(profile.phone()).toHaveValue('555-0101');
            await expect(profile.affiliation()).toHaveValue(`Affiliation ${tag}`);
            await expect(profile.country()).toHaveValue('CA');

            // Another account's address (a roster account of the press):
            // refused by the server at the top right and in the box's label;
            // the phone change is lost.
            await profile.email().fill(getEmail('author.alex'));
            await profile.phone().fill('555-0102');
            await profile.save();
            await expect(profile.toast).toContainText(EMAIL_TAKEN);
            await expect(profile.emailLabel()).toContainText(EMAIL_TAKEN);
            await profile.open('identity');
            await profile.open('contact');
            await expect(profile.email()).toHaveValue(email);
            await expect(profile.phone()).toHaveValue('555-0101');
        } finally {
            await context.close();
        }
    });

    test('S4: change the email address by confirming the emailed link', async ({browser, baseURL, ompApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(180_000);
        const tag = makeTag('s4', testInfo);
        const username = `${tag}au`;
        const oldEmail = `${username}@mail.test`;
        const newEmail = `${username}new@mail.test`;
        await ompApi.createContext({
            tag,
            users: [{username, givenName: 'Dee', familyName: 'Probe', roles: ['author']}],
        });

        // Two browsers signed in as the same account; the second parked on
        // the profile.
        const first = await freshLogin(browser, baseURL, tag, username);
        const second = await freshLogin(browser, baseURL, tag, username);
        try {
            const profile = new ProfilePage(first.page, tag);
            await profile.goto('contact');
            await requestEmailChange(profile, newEmail);

            // The pending notice, "Cancel", the old address read-only (Rule 6a).
            await expect(profile.pendingEmailNotice()).toContainText(
                `You have requested a change of your email to "${newEmail}". We have already sent you an email with directions on how to validate the changed email.`
            );
            await expect(profile.cancelPendingEmailButton()).toBeVisible();
            await expect(profile.email()).toHaveValue(oldEmail);
            await expect(profile.email()).not.toBeEditable();

            // The other session keeps working.
            const otherProfile = new ProfilePage(second.page, tag);
            await otherProfile.goto('identity');
            await otherProfile.open('roles');

            // One message to the OLD address from the account holder's own
            // name, naming the new address; nothing to the new address (Rule
            // 6b; the control is the message that did arrive).
            const summary = await pkpMail.find({to: oldEmail, subject: CHANGE_EMAIL_SUBJECT});
            expect(summary.From.Name).toBe('Dee Probe');
            expect(summary.From.Address).toBe(oldEmail);
            await pkpMail.expectNone({
                to: newEmail,
                subject: CHANGE_EMAIL_SUBJECT,
                afterControl: {to: oldEmail, subject: CHANGE_EMAIL_SUBJECT},
            });
            const {full, confirm} = await changeEmailLinks(pkpMail, summary);
            expect(full.Text || full.HTML).toContain(newEmail);

            // "confirm", still signed in: the Contact tab with the new
            // address, editable (Rule 6c).
            await first.page.goto(confirm);
            await first.page.waitForURL(/\/user\/profile/, {waitUntil: 'commit', timeout: 30_000});
            await profile.expectOpen('contact');
            await expect(profile.email()).toHaveValue(newEmail);
            await expect(profile.email()).toBeEditable();
            await expect(profile.pendingEmailNotice()).toHaveCount(0);

            // Sign out; the new address signs in with the unchanged password.
            await signOut(first.page);
            const loginPage = new LoginPage(first.page);
            await loginPage.signIn(newEmail, getPassword(username));
            await expect(first.page).not.toHaveURL(/\/login/);

            // The old address is refused.
            await expectSignInRefused(browser, baseURL, tag, oldEmail, getPassword(username));
        } finally {
            await first.context.close();
            await second.context.close();
        }
    });

    test('S5: cancel, and reject, an email change', async ({browser, baseURL, ompApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(180_000);
        const tag = makeTag('s5', testInfo);
        const username = `${tag}au`;
        const oldEmail = `${username}@mail.test`;
        const firstNew = `${username}one@mail.test`;
        const secondNew = `${username}two@mail.test`;
        await ompApi.createContext({
            tag,
            users: [{username, givenName: 'Cal', familyName: 'Probe', roles: ['author']}],
        });

        const {context, page} = await freshLogin(browser, baseURL, tag, username);
        try {
            const profile = new ProfilePage(page, tag);
            await profile.goto('contact');

            // Request, then the tab's "Cancel": saved inside the tab, the
            // notice gone, the old address editable (Rule 6e).
            await requestEmailChange(profile, firstNew);
            const firstMessage = await pkpMail.find({
                to: oldEmail,
                subject: CHANGE_EMAIL_SUBJECT,
                contains: firstNew,
            });
            const firstLinks = await changeEmailLinks(pkpMail, firstMessage);
            await profile.cancelPendingEmail();
            await expect(profile.inTabNotice('contact')).toContainText(SAVED_MESSAGE);
            await expect(profile.pendingEmailNotice()).toHaveCount(0);
            await expect(profile.email()).toHaveValue(oldEmail);
            await expect(profile.email()).toBeEditable();

            // The cancelled message's "confirm" link is dead (Rule 6f).
            await page.goto(firstLinks.confirm);
            await expect(page.getByRole('heading', {name: 'Invitation Unavailable'})).toBeVisible();

            // A second request; its "reject" link asks, then discards (Rule 6d).
            await profile.goto('contact');
            await requestEmailChange(profile, secondNew);
            const secondMessage = await pkpMail.find({
                to: oldEmail,
                subject: CHANGE_EMAIL_SUBJECT,
                contains: secondNew,
            });
            const secondLinks = await changeEmailLinks(pkpMail, secondMessage);
            await page.goto(secondLinks.reject);
            await expect(page.getByRole('heading', {name: 'Decline Invitation'})).toBeVisible();
            await expect(
                page.getByText(
                    'Are you sure you want to decline this invitation? Confirm the decline by clicking the button below.'
                )
            ).toBeVisible();
            await page.getByRole('button', {name: 'Confirm Decline Invitation', exact: true}).click();
            await page.waitForURL(/\/user\/profile/, {waitUntil: 'commit', timeout: 30_000});
            await profile.expectOpen('contact');
            await expect(profile.email()).toHaveValue(oldEmail);
            await expect(profile.email()).toBeEditable();
            await expect(profile.pendingEmailNotice()).toHaveCount(0);
            await expect(profile.toast).toContainText(SAVED_MESSAGE);

            // That message's "confirm" link is now dead too.
            await page.goto(secondLinks.confirm);
            await expect(page.getByRole('heading', {name: 'Invitation Unavailable'})).toBeVisible();
        } finally {
            await context.close();
        }
    });

    test('S6: take a role and give it up', async ({browser, baseURL, ompApi, asUser}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const username = `${tag}rd`;
        const email = `${username}@mail.test`;
        const contextName = `Scratch context ${tag}`;
        await ompApi.createContext({
            tag,
            users: [{username, givenName: 'Rae', familyName: 'Scratch', roles: ['reader']}],
        });

        const {context, page} = await freshLogin(browser, baseURL, tag, username);
        try {
            const profile = new ProfilePage(page, tag);
            await profile.goto('roles');

            // Under "Roles": exactly the press's four boxes, Reader ticked,
            // the rest not; no editorial box and no "Internal Reviewer"
            // (Rule 8a, OMP1); the press not named; a closed fold reading
            // "Register with other presses" (Rule 8c).
            await expect(profile.form('roles').getByText('Roles', {exact: true})).toBeVisible();
            expect(await profile.currentContextRoleLabels()).toEqual(PRESS_ROLE_BOXES);
            await expect(profile.roleBox('Reader')).toBeChecked();
            await expect(profile.roleBox('Author')).not.toBeChecked();
            await expect(profile.roleBox('Chapter Author')).not.toBeChecked();
            await expect(profile.roleBox('External Reviewer')).not.toBeChecked();
            await expect(profile.currentContextSection()).not.toContainText(contextName);
            await expect(profile.otherContextsLinkText()).toHaveText(OTHER_PRESSES);
            expect(await profile.isOtherContextsOpen()).toBe(false);

            // Tick Author, save, reload: held; Users & Roles lists both roles
            // (Rule 8b).
            await profile.roleBox('Author').check();
            await profile.save();
            await expect(profile.toast).toContainText(SAVED_MESSAGE);
            // (The address names the tab, so the reload reopens Roles.)
            await page.reload();
            await profile.expectOpen('roles');
            await expect(profile.roleBox('Author')).toBeChecked();
            const adminPage = await (await asUser('admin')).newPage();
            let row = await usersRolesRow(adminPage, tag, username, email);
            await expect(row).toContainText('Reader');
            await expect(row).toContainText('Author');

            // Untick Author, save: the role is gone from that list.
            await profile.roleBox('Author').uncheck();
            await profile.save();
            await expect(profile.toast).toContainText(SAVED_MESSAGE);
            row = await usersRolesRow(adminPage, tag, username, email);
            await expect(row).toContainText('Reader');
            await expect(row).not.toContainText('Author');

            // Two reviewing interests (Enter, then a comma) save with the tab
            // and are listed on reopening (Rule 8d; a press has the box).
            const alpha = `${tag}alpha`;
            const beta = `${tag}beta`;
            await profile.addInterest(alpha, {terminator: 'Enter'});
            await profile.addInterest(beta, {terminator: ','});
            await profile.save();
            await expect(profile.toast).toContainText(SAVED_MESSAGE);
            await profile.open('identity');
            await profile.open('roles');
            await expect(profile.interestChips()).toHaveText([alpha, beta]);
        } finally {
            await context.close();
        }
    });

    test('S7: set a profile image, then remove it', async ({browser, baseURL, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const username = `${tag}au`;
        await ompApi.createContext({
            tag,
            users: [{username, givenName: 'Pia', familyName: 'Public', roles: ['author']}],
        });

        const {context, page} = await freshLogin(browser, baseURL, tag, username);
        try {
            // A refused upload raises a browser alert (Rule 9a): the handler
            // goes on before any upload, so a refusal fails the test instead
            // of hanging it.
            page.on('dialog', (dialog) => dialog.accept());
            const profile = new ProfilePage(page, tag);
            await profile.goto('public');
            await expect(profile.form('public').getByRole('button', {name: 'Upload File'})).toBeVisible();
            await expect(profile.deleteImageButton()).toHaveCount(0);

            // A .png larger than 150 × 150: the page reloads on the Public tab
            // with "Delete" under "Profile Image" (Rule 9a).
            await profile.uploadImage(IMAGE_FIXTURE);
            await profile.expectSelectedTab('public');
            await expect(profile.deleteImageButton()).toBeVisible();

            // A bio and a homepage without "http://": refused in the browser,
            // nothing sent, the bio stays (Rule 9c).
            const saves = countSaves(page);
            const bio = `Bio statement ${tag}`;
            await profile.expectBioEditorReady();
            await profile.bioEditorBody().click();
            await profile.bioEditorBody().fill(bio);
            await profile.homepage().fill('example.org');
            await profile.saveButton().click();
            await expect(profile.fieldError(URL_INVALID)).toBeVisible();
            expect(saves.count).toBe(0);
            await expect(profile.bioEditorBody()).toContainText(bio);

            // Corrected: saved at the top right.
            await profile.homepage().fill('https://example.org');
            await profile.save();
            expect(saves.count).toBe(1);
            await expect(profile.toast).toContainText(SAVED_MESSAGE);

            // "Delete": the page reloads without the button; the bio and the
            // homepage stay (Rule 9b).
            await profile.deleteImage();
            await profile.expectSelectedTab('public');
            await expect(profile.form('public').getByRole('button', {name: 'Upload File'})).toBeVisible();
            await expect(profile.deleteImageButton()).toHaveCount(0);
            await expect(profile.homepage()).toHaveValue('https://example.org');
            await profile.expectBioEditorReady();
            await expect(profile.bioEditorBody()).toContainText(bio);
        } finally {
            await context.close();
        }
    });

    test('S8: change the password', async ({browser, baseURL, ompApi}, testInfo) => {
        test.slow();
        test.setTimeout(180_000);
        const tag = makeTag('s8', testInfo);
        const username = `${tag}au`;
        // Short passwords on purpose: the boxes cut input at 32 characters (A7).
        const current = `pw${tag}`;
        const next = `new${tag}`;
        await ompApi.createContext({
            tag,
            users: [{username, givenName: 'Pat', familyName: 'Password', roles: ['author'], password: current}],
        });

        // Two browsers signed in as the same account.
        const first = await freshLogin(browser, baseURL, tag, username, current);
        const second = await freshLogin(browser, baseURL, tag, username, current);
        try {
            const other = new ProfilePage(second.page, tag);
            await other.goto('identity');

            const profile = new ProfilePage(first.page, tag);
            await profile.goto('password');
            await expect(
                profile.form('password').getByText('The password must be at least 6 characters.')
            ).toBeVisible();

            // A wrong current password: the notice with that sentence, the
            // three boxes emptied (Rule 10a).
            await profile.fillPasswords({current: `wrong${tag}`, next});
            await profile.save();
            await expect(profile.passwordErrorNotice()).toContainText(ERRORS_HEADING);
            await expect(profile.passwordErrorNotice()).toContainText(CURRENT_PASSWORD_WRONG);
            await expect(profile.currentPassword()).toHaveValue('');
            await expect(profile.newPassword()).toHaveValue('');
            await expect(profile.repeatPassword()).toHaveValue('');

            // Two different new passwords: "do not match" in the notice and
            // under "New password"; the current-password sentence is gone.
            await profile.fillPasswords({current, next, repeat: `${next}x`});
            await profile.save();
            await expect(profile.passwordErrorNotice()).toContainText(PASSWORDS_MISMATCH);
            await expect(profile.passwordErrorNotice()).not.toContainText(CURRENT_PASSWORD_WRONG);
            await expect(profile.newPasswordSubLabel()).toHaveText(PASSWORDS_MISMATCH);

            // The current password as the new one.
            await profile.fillPasswords({current, next: current});
            await profile.save();
            await expect(profile.passwordErrorNotice()).toContainText(PASSWORD_SAME_AS_OLD);

            // A valid new password: saved at the top right (Rule 10b); the
            // earlier notice is A11's and is not asserted.
            await profile.fillPasswords({current, next});
            await profile.save();
            await expect(profile.toast).toContainText(SAVED_MESSAGE);

            // The other browser's full reload lands on the Login page.
            await second.page.goto(other.url('identity'));
            await expect(second.page.locator('form#login')).toBeVisible();
            await expect(second.page).toHaveURL(/\/login/);

            // The session that changed it stays signed in; after a sign-out
            // the new password works and the old one is refused.
            await signOut(first.page);
            const loginPage = new LoginPage(first.page);
            await loginPage.signIn(username, next);
            await expect(first.page).not.toHaveURL(/\/login/);
            await expectSignInRefused(browser, baseURL, tag, username, current);
        } finally {
            await first.context.close();
            await second.context.close();
        }
    });

    test('S9: create and delete an API key', async ({browser, baseURL, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s9', testInfo);
        const username = `${tag}au`;
        await ompApi.createContext({
            tag,
            users: [{username, givenName: 'Kay', familyName: 'Api', roles: ['author']}],
        });

        const {context, page} = await freshLogin(browser, baseURL, tag, username);
        try {
            const profile = new ProfilePage(page, tag);
            await profile.goto('apiKey');
            const saves = countSaves(page);

            // "None" beside "Create API Key" and the generate note (Rule 12a).
            await expect(profile.apiKeyBox()).toHaveValue('None');
            await expect(profile.createApiKeyButton()).toBeVisible();
            await expect(profile.deleteApiKeyButton()).toHaveCount(0);
            await expect(profile.apiKeyNote()).toHaveText(API_KEY_GENERATE_NOTE);

            // Create: a long key replaces "None", "Delete" and the remove
            // note appear, saved inside the tab (Rule 12b).
            await profile.createApiKey();
            expect(saves.count).toBe(1);
            await expect(profile.apiKeyBox()).toHaveValue(/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/);
            const key = await profile.apiKeyBox().inputValue();
            expect(key.length).toBeGreaterThan(100);
            await expect(profile.deleteApiKeyButton()).toBeVisible();
            await expect(profile.createApiKeyButton()).toHaveCount(0);
            await expect(profile.apiKeyNote()).toHaveText(API_KEY_REMOVE_NOTE);
            await expect(profile.inTabNotice('apiKey')).toContainText(SAVED_MESSAGE);

            // Reloaded: the same key.
            await profile.goto('apiKey');
            await expect(profile.apiKeyBox()).toHaveValue(key);

            // "Delete" then Cancel in the browser's dialog: the key stays and
            // nothing is sent (Rule 12c; the OK press below is the control).
            await profile.deleteApiKey({confirm: false});
            await expect(profile.apiKeyBox()).toHaveValue(key);
            await expect(profile.deleteApiKeyButton()).toBeVisible();
            expect(saves.count).toBe(1);

            // "Delete" then OK: back to "None" with "Create API Key", saved
            // inside the tab.
            await profile.deleteApiKey({confirm: true});
            expect(saves.count).toBe(2);
            await expect(profile.apiKeyBox()).toHaveValue('None');
            await expect(profile.createApiKeyButton()).toBeVisible();
            await expect(profile.deleteApiKeyButton()).toHaveCount(0);
            await expect(profile.inTabNotice('apiKey')).toContainText(SAVED_MESSAGE);
        } finally {
            await context.close();
        }
    });

    test('S10: the Notifications tab is a form of paired boxes', async ({browser, baseURL, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        const username = `${tag}mg`;
        // A scratch press's own Press Manager, so no seeded account's choices change.
        await ompApi.createContext({
            tag,
            users: [{username, givenName: 'Mona', familyName: 'Manager', roles: ['manager']}],
        });

        const {context, page} = await freshLogin(browser, baseURL, tag, username);
        try {
            const profile = new ProfilePage(page, tag);
            await profile.goto('notifications');

            // The description, the four groups (the same four on a press),
            // one pair of boxes per row, "Save" (Rule 11).
            await expect(profile.form('notifications').getByText(NOTIFICATIONS_INTRO)).toBeVisible();
            await expect(profile.notificationGroups()).toHaveText(NOTIFICATION_GROUPS);
            const rows = await profile.allowBoxes().count();
            expect(rows).toBeGreaterThan(0);
            await expect(profile.emailBoxes()).toHaveCount(rows);
            await expect(profile.saveButton()).toBeVisible();

            // Unticking an "Enable…" box greys out its email box, unticked.
            const pair = profile.notificationPair('notificationNewAnnouncement');
            await expect(pair.allow).toBeChecked();
            await expect(pair.email).toBeEnabled();
            await pair.allow.uncheck();
            await expect(pair.email).toBeDisabled();
            await expect(pair.email).not.toBeChecked();

            // Save, reopen: still unticked, the pairing applied again.
            await profile.save();
            await expect(profile.toast).toContainText(SAVED_MESSAGE);
            await profile.open('identity');
            await profile.open('notifications');
            await expect(pair.allow).not.toBeChecked();
            await expect(pair.email).toBeDisabled();

            // Tick it again and save to restore.
            await pair.allow.check();
            await expect(pair.email).toBeEnabled();
            await profile.save();
            await expect(profile.toast).toContainText(SAVED_MESSAGE);
            await profile.open('identity');
            await profile.open('notifications');
            await expect(pair.allow).toBeChecked();
        } finally {
            await context.close();
        }
    });
});
