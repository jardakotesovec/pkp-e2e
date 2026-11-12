// @ts-check
/**
 * @file playwright/tests/serial/U53-users-management.spec.js
 *
 * Users management — OJS suite, the Site Administrator's notices: S7
 * (the Site Administrator adds a user) and S8 (the Site Administrator
 * changes a user's roles on "Edit User"). The other scenarios, the
 * register IDs left out and the suite's coverage boundaries are in
 * `../U53-users-management.spec.js`. Spec: docs/specs/U53-users-management.md
 *
 * `@solo`, on purpose: both scenarios read the notices of the legacy
 * "Add User" / "Edit User" window ("The selected username is already in
 * use by another user.", "You need to select at least one role…", "User
 * edited."), which are the Site Administrator's trivial notifications; one
 * waits on the server until a page of the same account fetches it, and
 * lib/pkp's `NotificationHandler::fetchNotification` hands every pending
 * one of the account to whichever `admin` page asks first and deletes them
 * (patterns.md parallel lesson 2). Several parallel and serial tests sign
 * in as `admin`, and `admin` cannot be replaced by a throwaway account
 * (the Settings wizard of "Hosted …" is the Site Administrator's), so the
 * two run alone in the `ojs-solo` project (flake-s26 fixAD).
 *
 * Every test seeds its own scratch journal with throwaway accounts; `admin`
 * is enrolled as a manager of every scratch context. Every actor is opened
 * through `asUser`; sign-ins the scenarios drive by hand run in fresh
 * anonymous contexts. Mailpit reads are scoped by the throwaway recipient
 * addresses (PRINCIPLES A8).
 */
const {test, expect} = require('../../support/fixtures.js');
const {LoginPage} = require('../../../../../shared/playwright/pages/LoginPage.js');
const {
    UsersListPage,
    EmailUserWindow,
    HostedContextsPage,
    UserDetailsWindow,
} = require('../../../../../shared/playwright/pages/UsersManagementPages.js');

const LABELS = {hostedLabel: 'Hosted Journals'};
const REVIEWER_ROLE = 'Reviewer';
const NO_ROLE_REFUSAL = 'You need to select at least one role to be associated with this user.';
const FORM_CHANGED = 'The data on this form has changed. Do you wish to continue without saving?';
const MORE_DETAILS = [
    'Homepage URL',
    'Phone',
    'Working Languages',
    'Reviewing interests',
    'Affiliation',
    'Bio Statement (e.g., department and rank)',
    'Mailing Address',
    'Signature',
];

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u53s${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** The seeded password rule: the username twice. */
const pw = (username) => `${username}${username}`;
/** The seeded address rule. */
const mail = (username) => `${username}@mail.test`;

/** A signed-in page for an actor (a fresh `asUser` context). */
async function signedIn(asUser, username) {
    const context = await asUser(username);
    return context.newPage();
}

/** A fresh anonymous context and page (never inherits a session). */
async function anonPage(browser, baseURL) {
    const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
    return {context, page: await context.newPage()};
}

/**
 * Record the browser questions a page raises; a page-leave question is
 * accepted (dismissing it cancels the navigation), any other is dismissed.
 */
function recordQuestions(page) {
    const questions = [];
    page.on('dialog', (dialog) => {
        questions.push(dialog.message());
        (dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss()).catch(() => {});
    });
    return questions;
}

test.describe('users management: the Site Administrator\'s notices', () => {
    test('S7: the Site Administrator adds a user @solo', async ({asUser, ojsApi, pkpMail, browser, baseURL}, testInfo) => {
        test.slow();
        const tag = makeTag(7, testInfo);
        const lena = `l${tag}`;
        const contact = `contact${tag}@mail.test`;
        const rosaEmail = `rosa-${tag}@mail.test`;
        await ojsApi.createContext({
            tag,
            context: {contactName: 'Pat Contact', contactEmail: contact},
            users: [{username: lena, givenName: 'Lena', familyName: 'Ortiz', roles: ['author']}],
        });
        const ap = await signedIn(asUser, 'admin');
        const questions = recordQuestions(ap);
        const hosted = new HostedContextsPage(ap, LABELS);

        // The "Users" tab (Rule 19).
        await hosted.gotoFromAdministration();
        await hosted.openSettingsWizard(tag);
        let grid = await hosted.openWizardTab('Users');
        await expect(grid.title('Current Users')).toBeVisible();
        await expect(grid.rows()).toHaveCount(2);
        await expect(grid.row('admin@mail.test')).toHaveCount(1);
        await expect(grid.row(mail(lena))).toHaveCount(1);
        // The spec's "Items per page: 10 25 50 75 100" in front shows only on a
        // longer list (T-ojs-1).
        expect(await grid.pagingLine()).toBe('1 - 2 of 2 items');

        // Nothing typed (Rule 21; Fields, "Add User").
        const add = new UserDetailsWindow(ap, 'Add User');
        await grid.addUserLink().click();
        await add.expectOpen();
        await expect(add.stepHeading('Step #1: Fill in User Details')).toBeVisible();
        await expect(add.mustChangePassword).toBeChecked();
        await expect(add.sendNotify).not.toBeChecked();
        await add.suggest();
        await expect(add.username).toHaveValue('');
        await expect(add.notice(/\S/)).toHaveCount(0);
        expect(questions).toEqual([]);
        await add.pressOk();
        await expect(await add.errorFor(add.givenName)).toHaveText('This field is required.');

        // Values refused (Fields, "Add User").
        await add.givenName.fill('Rosa');
        await add.familyName.fill('Delgado');
        await add.username.fill(lena);
        await add.email.fill(mail(lena));
        await add.password.fill('abc12');
        await add.password2.fill('abc12');
        await add.openMoreDetails();
        for (const label of MORE_DETAILS) {
            await expect(add.label(label).first()).toBeVisible();
        }
        // An address that is not one stops "OK" in the browser, and the
        // server's refusals come at the next "OK" (T-ojs-2).
        const updates = [];
        ap.on('request', (request) => {
            if (request.method() === 'POST' && request.url().includes('update-user')) {
                updates.push(request.url());
            }
        });
        await add.userUrl.fill('example');
        await add.pressOk();
        await expect(await add.errorFor(add.userUrl)).toHaveText('Please enter a valid URL.');
        expect(updates, 'nothing sent').toEqual([]);
        await add.userUrl.fill('');
        await add.pressOk();
        await expect(add.notice('The selected username is already in use by another user.').first()).toBeVisible();
        await expect(add.notice('The selected email address is already in use by another user.').first()).toBeVisible();
        await expect(add.notice('The password must be at least 6 characters.').first()).toBeVisible();
        expect(updates).toHaveLength(1);
        await expect(add.form).toBeVisible();
        await expect(add.roleForm).toHaveCount(0);

        // Passwords that differ (Fields, "Add User").
        await add.username.fill('');
        await add.suggest();
        await expect(add.username).toHaveValue(/^rdelgado\d*$/);
        const rosa = await add.username.inputValue();
        await add.email.fill(rosaEmail);
        await add.password.fill('abc123');
        await add.password2.fill('abc124');
        await add.pressOk();
        await expect(add.notice('The passwords do not match.').first()).toBeVisible();

        // "Generate Password" (Rule 23).
        await add.generatePassword.check();
        for (const box of [add.password, add.password2]) {
            await expect(box).toHaveValue('********');
            await expect(box).toBeDisabled();
        }
        await expect(add.sendNotify).toBeChecked();
        await expect(add.sendNotify).toBeDisabled();

        // Step 2 (Rules 21, 22; Fields "Appear on Masthead").
        await add.pressOk();
        await add.expectStep2('Rosa Delgado');
        const mastheads = await add.mastheadBoxes();
        expect(mastheads.length).toBeGreaterThan(0);
        expect(mastheads.filter((box) => !box.checked)).toEqual([]);
        const roleNames = await add.roleForm.locator('input[name="userGroupIds[]"]').evaluateAll((els) =>
            els.map((e) => (e.closest('label') || document.querySelector(`label[for="${e.id}"]`) || {}).innerText.trim())
        );
        expect(roleNames).toEqual(mastheads.map((box) => box.label));
        await expect(add.mastheadBox(REVIEWER_ROLE)).toBeEnabled();
        await add.mastheadBox(REVIEWER_ROLE).uncheck();
        await expect(add.mastheadBox(REVIEWER_ROLE)).not.toBeChecked();
        await add.mastheadBox(REVIEWER_ROLE).check();
        await add.pressSave();
        await expect(add.notice(NO_ROLE_REFUSAL).first()).toBeVisible();
        await expect(add.roleForm).toBeVisible();

        // Saved (Rule 22).
        await add.roleBox('Author').check();
        await add.pressSave();
        await expect(add.roleForm).toHaveCount(0);
        await expect(grid.row(rosaEmail).first().locator('td').nth(3)).toHaveText('Author');

        // Rosa's mailbox (Side effects).
        const summary = await pkpMail.find({to: rosaEmail, subject: 'Journal Registration'});
        const message = await pkpMail.fullMessage(summary.ID);
        expect(message.From).toEqual(expect.objectContaining({Name: 'admin admin', Address: 'admin@mail.test'}));
        expect(message.ReplyTo.map((r) => r.Address)).toEqual([contact]);
        expect(message.Text).toContain(`You have now been registered as a user with Scratch context ${tag}`);
        const credentials = message.Text.match(/Username:\s*(\S+)\s+Password:\s*(\S+)/);
        expect(credentials, 'username and password in the email').toBeTruthy();
        expect(credentials[1]).toBe(rosa);
        expect(await pkpMail.count({to: rosaEmail})).toBe(1);

        // Rosa's first sign-in: a new password first (Rule 23).
        const {context, page: rp} = await anonPage(browser, baseURL);
        try {
            const login = new LoginPage(rp);
            await login.gotoContext(tag);
            await login.submitCredentials(rosa, credentials[2]);
            await rp.waitForURL(/\/login\/changePassword/, {waitUntil: 'commit'});
            await expect(rp.getByRole('heading', {name: 'Change Password'})).toBeVisible();
        } finally {
            await context.close();
        }

        // "Cancel" and "Close" (Rule 21).
        grid = await hosted.reloadWizardTab('Users');
        await grid.addUserLink().click();
        await add.expectOpen();
        await add.givenName.fill('Tess');
        await add.cancel();
        expect(questions).toEqual([]);
        await expect(async () => {
            await grid.addUserLink().click();
            await expect(add.form).toBeVisible({timeout: 2_000});
        }).toPass({timeout: 30_000});
        await add.expectOpen();
        await expect(add.givenName).toHaveValue('');
        await add.givenName.fill('Tess');
        await add.givenName.blur();
        await add.closeButton().click();
        await expect.poll(() => questions).toEqual([FORM_CHANGED]);

        // Control: the Users list lists Rosa, and no invitation (Rules 1, 22).
        const list = new UsersListPage(ap, tag);
        await list.goto();
        await expect(list.rolesCell(list.row(rosaEmail))).toHaveText('Author');
        await expect(list.invitationsTable).toBeVisible();
        await expect(list.invitationRow(rosaEmail)).toHaveCount(0);
    });

    test('S8: the Site Administrator changes a user\'s roles on "Edit User" @solo', async ({
        asUser,
        ojsApi,
        pkpMail,
        browser,
        baseURL,
    }, testInfo) => {
        test.slow();
        const tag = makeTag(8, testInfo);
        const lena = `l${tag}`;
        const rui = `r${tag}`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: lena, givenName: 'Lena', familyName: 'Ortiz', roles: ['author']},
                {username: rui, givenName: 'Rui', familyName: 'Tanaka', roles: ['externalReviewer']},
            ],
        });
        const ap = await signedIn(asUser, 'admin');
        const hosted = new HostedContextsPage(ap, LABELS);
        await hosted.gotoFromAdministration();
        await hosted.openSettingsWizard(tag);
        let grid = await hosted.openWizardTab('Users');

        // "Edit User" (Rule 24; Fields, "Edit User").
        const edit = new UserDetailsWindow(ap, 'Edit User');
        await grid.chooseAction(mail(lena), 'Edit User');
        await edit.expectOpen();
        await expect(edit.stepHeading('User Details')).toBeVisible();
        await expect(edit.username).toHaveCount(0);
        await expect(edit.form).toContainText(`Username ${lena}`);
        await expect(edit.roleBox('Author')).toBeChecked();
        await expect(edit.roleBox('Reader')).not.toBeChecked();
        await expect(edit.mastheadBox(REVIEWER_ROLE)).toBeChecked();
        await expect(edit.mastheadBox(REVIEWER_ROLE)).toBeDisabled();
        await expect(edit.gossip).toHaveCount(0);
        await expect(edit.label('Signature').first()).toBeAttached();

        // Every role unticked (Rule 24).
        await edit.roleBox('Author').uncheck();
        await edit.pressOk();
        await expect(edit.notice(NO_ROLE_REFUSAL).first()).toBeVisible();
        await expect(edit.form).toBeVisible();

        // Roles changed (Rule 24).
        await edit.roleBox('Reader').check();
        await edit.pressOk();
        await expect(edit.form).toHaveCount(0);
        await expect(ap.getByText('User edited.').first()).toBeVisible();
        // The row as refreshed still lists the ended role (T-ojs-3,
        // unasserted), and so can a reload soon after the save (T-ops-3):
        // read after a reload, reloading until the row has caught up.
        await expect(async () => {
            grid = await hosted.reloadWizardTab('Users');
            await expect(grid.row(mail(lena)).first().locator('td').nth(3)).toHaveText('Reader', {timeout: 2_000});
        }).toPass({timeout: 30_000});

        // A reviewer's account (Rule 24; Fields, "Edit User"): the control
        // for "no Editorial Notes" on Lena's window.
        await expect(async () => {
            await grid.chooseAction(mail(rui), 'Edit User');
            await expect(edit.form).toBeVisible({timeout: 2_000});
        }).toPass({timeout: 30_000});
        await edit.expectOpen();
        await expect(edit.gossip).toHaveCount(1);
        await expect(edit.form.getByText('Editorial Notes')).toBeVisible();
        await edit.cancel();

        // Users & Roles (Rules 1, 24).
        const list = new UsersListPage(ap, tag);
        await list.goto();
        const lenaRow = list.row(mail(lena));
        await expect(list.rolesCell(lenaRow)).toHaveText('Reader');
        await expect(list.invitationsTable).toBeVisible();
        await expect(list.invitationRow(mail(lena))).toHaveCount(0);

        // Lena's mailbox: nothing about either change (Rule 24; Side
        // effects). The control is an email sent to her from her row.
        const email = new EmailUserWindow(ap);
        await list.chooseAction(lenaRow, 'Email');
        await email.expectOpen();
        await email.subject.fill(`Control ${tag}`);
        await email.typeBody('Control message.');
        await email.sendAndWait();
        await email.expectClosed();
        await pkpMail.find({to: mail(lena), subject: `Control ${tag}`});
        expect(await pkpMail.count({to: mail(lena)})).toBe(1);

        // Control: Lena signs in with her old password (Fields "Password").
        const {context, page: lp} = await anonPage(browser, baseURL);
        try {
            const login = new LoginPage(lp);
            await login.gotoContext(tag);
            await login.signIn(lena, pw(lena));
        } finally {
            await context.close();
        }
    });
});
