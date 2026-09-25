// @ts-check
/**
 * @file playwright/tests/U53-users-management.spec.js
 *
 * Users management — OJS suite, one test per canonical scenario the spec runs
 * on OJS (scenarios 1–8, all common).
 * Spec: docs/specs/U53-users-management.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 🐞,
 * A2 🐞, A3 ❓, A7 🐞, A8 ❓, A13 🐞. Where a test passes through one (S4
 * reads the menus of rows outside the manager's reach, S3 opens "Enable
 * User", S5 reaches the removed user's roles page through her row, S7 reads
 * the grid's rows) it asserts the effect the spec states and leaves the
 * finding's own claim unasserted either way.
 * The spec's Coverage section records everything else left out.
 *
 * Every test seeds its own scratch journal with throwaway accounts (the
 * seeded roster and publicknowledge stay untouched); the Site Administrator
 * `admin` is enrolled as a manager of every scratch journal and is the
 * signed-in actor of S7 and S8. Every actor is opened through `asUser`
 * (no default user: a multi-actor test sets none, patterns.md "Fixture
 * selection"); sign-ins the scenarios drive by hand run in fresh anonymous
 * contexts. Mailpit reads are scoped by the throwaway recipient addresses,
 * which carry the app and the test in the seed tag, and every "no email" is
 * bounded by a message sent to the same address the same way (PRINCIPLES
 * A8). "Today" is computed in the process's zone; the suite runs with
 * TZ=UTC, the PHP servers' clock.
 */
const {test, expect} = require('../support/fixtures.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {ParticipantsPanel} = require('../../../../shared/playwright/pages/StageParticipantsPages.js');
const {
    UsersListPage,
    EmailUserWindow,
    DisableUserWindow,
    RemoveUserDialog,
    MergeUserWindow,
    HostedContextsPage,
    UserDetailsWindow,
} = require('../../../../shared/playwright/pages/UsersManagementPages.js');

const LABELS = {hostedLabel: 'Hosted Journals'};
const MANAGER_ROLE = 'Journal manager';
const REVIEWER_ROLE = 'Reviewer';
const NO_ROLE_BOX = 'Include users with no roles in this journal.';
const GRID_COLUMNS = ['Given Name', 'Family Name', 'Username', 'Roles', 'Email'];
const ORCID_ID = '0000-0003-1419-2405';
const DISABLE_NOTE =
    "Please note that once a user is disabled, you won't be able to add them to any roles until the user is enabled again.";
const ENABLE_NOTE =
    "Once the user is enabled, they will regain access to the site, and you'll be able to invite them to roles as needed.";
const REMOVE_SENTENCE =
    'Remove this user from this journal? This action will unenroll the user from all roles within this journal.';
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

/** YYYY-MM-DD in the process's zone (TZ=UTC, the servers' clock). */
function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

/** The answer the Users list fetches after a change, armed before the action. */
function listRefresh(page) {
    return page.waitForResponse((r) => /\/api\/v1\/users\?/.test(r.url()) && r.request().method() === 'GET', {
        timeout: 30_000,
    });
}

test.describe('users management', () => {
    test('S2: email a user', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        const tag = makeTag(2, testInfo);
        const manager = `m${tag}`;
        const quinn = `q${tag}`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: 'Mara', familyName: 'Scratchmanager', roles: ['manager']},
                {username: quinn, givenName: 'Quinn', familyName: 'Ashdown', roles: ['author']},
            ],
        });
        const mp = await signedIn(asUser, manager);
        const list = new UsersListPage(mp, tag);
        const email = new EmailUserWindow(mp);
        await list.goto();
        const quinnRow = list.row(mail(quinn));

        // "Subject" empty (Fields, the "Email" window).
        await list.chooseAction(quinnRow, 'Email');
        await email.expectOpen();
        await expect(email.to).toHaveValue(`Quinn Ashdown <${mail(quinn)}>`);
        await expect(email.to).toBeDisabled();
        await email.typeBody('Hello');
        await email.sendButton.click();
        await expect(email.form.getByText('This field is required.', {exact: true})).toBeVisible();
        await expect(email.form).toBeVisible();

        // "Body" empty: the notice, nothing under the field, the window open.
        await email.subject.fill('Welcome aboard');
        await email.clearBody();
        await email.sendAndWait();
        await expect(mp.getByText('Please provide the email body text.').first()).toBeVisible();
        await expect(email.form.getByText('This field is required.', {exact: true})).toBeHidden();
        await expect(email.form).toBeVisible();

        // "Cancel" (Rule 9); the mailbox is read below, after the send.
        await email.cancel();

        // Sent: the window closes, and no message says the email went (Rule 9).
        await list.chooseAction(quinnRow, 'Email');
        await email.expectOpen();
        await email.subject.fill('Welcome aboard');
        await email.typeBody('Thank you for your submission.');
        const refreshed = listRefresh(mp);
        await email.sendAndWait();
        await email.expectClosed();
        await refreshed;
        await expect(mp.locator('.app__notifications, [role="status"]').filter({hasText: /sent/i})).toHaveCount(0);

        // Quinn's mailbox: this one email, and nothing from the refused
        // tries or the cancelled window (Rule 9; Side effects).
        const summary = await pkpMail.find({to: mail(quinn), subject: 'Welcome aboard'});
        const message = await pkpMail.fullMessage(summary.ID);
        expect(message.From).toEqual(expect.objectContaining({Name: 'Mara Scratchmanager', Address: mail(manager)}));
        expect(message.Subject).toBe('Welcome aboard');
        expect(message.Text).toContain('Thank you for your submission.');
        expect(await pkpMail.count({to: mail(quinn)})).toBe(1);

        // Control: "Email" on the Journal Manager's own row.
        await list.chooseAction(list.row(mail(manager)), 'Email');
        await email.expectOpen();
        await expect(email.to).toHaveValue(`Mara Scratchmanager <${mail(manager)}>`);
        await email.cancel();
    });

    test('S3: disable and re-enable a user', async ({asUser, ojsApi, browser, baseURL}, testInfo) => {
        test.slow();
        const tag = makeTag(3, testInfo);
        const manager = `m${tag}`;
        const quinn = `q${tag}`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: 'Mara', familyName: 'Scratchmanager', roles: ['manager']},
                {username: quinn, givenName: 'Quinn', familyName: 'Ashdown', roles: ['author']},
            ],
        });

        // Quinn, signed in in a second browser: her profile and the home page
        // open signed in (the control for the session reads below).
        const qp = await signedIn(asUser, quinn);
        await qp.goto(`/index.php/${tag}/user/profile`);
        await expect(qp.locator('h1.app__pageHeading')).toHaveText('Profile');
        await qp.goto(`/index.php/${tag}`);
        await expect(qp.locator('#navigationUser')).toContainText(quinn);
        await expect(qp.locator('#navigationUser').getByRole('link', {name: 'Login', exact: true})).toHaveCount(0);

        const mp = await signedIn(asUser, manager);
        const questions = recordQuestions(mp);
        const list = new UsersListPage(mp, tag);
        await list.goto();
        const quinnRow = list.row(mail(quinn));
        await expect(list.nameCell(quinnRow)).toHaveText('Quinn Ashdown');
        await expect(list.disabledIcon(quinnRow)).toHaveCount(0);

        // "Cancel" (Rule 10).
        const disable = new DisableUserWindow(mp, 'Disable Quinn Ashdown');
        await list.chooseAction(quinnRow, 'Disable User');
        await disable.expectForm();
        await expect(disable.rolesLine('Current Roles : Author')).toBeVisible();
        await expect(disable.dialog.getByText('Reason for disabling user', {exact: true})).toBeVisible();
        await expect(disable.sentence(DISABLE_NOTE)).toBeVisible();
        await disable.reason.fill('Spam');
        await disable.cancel();
        expect(questions, 'no question on "Cancel"').toEqual([]);
        let labels = await list.menuLabels(quinnRow);
        expect(labels).toContain('Disable User');
        expect(labels).not.toContain('Enable User');

        // Disabled (Rule 10; Fields "Name").
        await list.chooseAction(quinnRow, 'Disable User');
        await disable.expectForm();
        await expect(disable.reason).toHaveValue('');
        await disable.reason.fill('Spam');
        await disable.ok();
        await expect(list.disabledIcon(quinnRow)).toHaveCount(1);
        labels = await list.menuLabels(quinnRow);
        expect(labels).toContain('Enable User');
        expect(labels).not.toContain('Disable User');

        // Still listed (Rule 11).
        await expect(list.rolesCell(quinnRow)).toHaveText('Author');
        expect(labels).toEqual(expect.arrayContaining(['Edit', 'Email', 'Merge user']));

        // Quinn, in the second browser: signed out (Rule 11).
        await qp.goto(`/index.php/${tag}/user/profile`);
        await expect(qp.locator('form#login')).toBeVisible();
        expect(new URL(qp.url()).pathname).toMatch(/\/login$/);
        await qp.goto(`/index.php/${tag}`);
        await expect(qp.locator('#navigationUser').getByRole('link', {name: 'Login', exact: true})).toBeVisible();
        await expect(qp.locator('#navigationUser')).not.toContainText(quinn);

        // Quinn signs in: refused with the reason (Rule 11).
        const login = new LoginPage(qp);
        await login.gotoContext(tag);
        await login.submitCredentials(quinn, pw(quinn));
        await expect(qp.getByText('Your account has been disabled for the following reason: Spam')).toBeVisible();
        await expect(login.form).toBeVisible();

        // "Enable User" (Rule 12). What the box arrives holding is A7's claim.
        const enable = new DisableUserWindow(mp, 'Enable Quinn Ashdown');
        await list.chooseAction(quinnRow, 'Enable User');
        await enable.expectForm();
        await expect(enable.rolesLine('Current Roles : Author')).toBeVisible();
        await expect(enable.dialog.getByText('Reason for enabling user', {exact: true})).toBeVisible();
        await expect(enable.sentence(ENABLE_NOTE)).toBeVisible();
        await enable.reason.fill('');
        await enable.ok();
        await expect(list.disabledIcon(quinnRow)).toHaveCount(0);
        labels = await list.menuLabels(quinnRow);
        expect(labels).toContain('Disable User');
        expect(labels).not.toContain('Enable User');

        // Quinn signs in again (Rule 12).
        await login.gotoContext(tag);
        await login.signIn(quinn, pw(quinn));

        // Control: the reason box is empty at the next "Disable User" (Rule 12).
        await list.chooseAction(quinnRow, 'Disable User');
        await disable.expectForm();
        await expect(disable.reason).toHaveValue('');
        await disable.cancel();
    });

    test('S4: users outside the manager\'s reach', async ({asUser, ojsApi}, testInfo) => {
        const tag = makeTag(4, testInfo);
        const second = `${tag}b`;
        const manager = `m${tag}`;
        const quinn = `q${tag}`;
        const nova = `n${tag}`;
        const lena = `l${tag}`;
        await ojsApi.createContext({
            tag: second,
            users: [
                {username: quinn, givenName: 'Quinn', familyName: 'Ashdown', roles: ['author']},
                {username: nova, givenName: 'Nova', familyName: 'Reyes', roles: [], pastRoles: [{role: 'reader'}]},
            ],
        });
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: 'Mara', familyName: 'Scratchmanager', roles: ['manager']},
                {username: quinn, roles: ['author']},
                {username: nova, roles: ['author']},
                {username: lena, givenName: 'Lena', familyName: 'Ortiz', roles: ['author']},
            ],
        });
        const mp = await signedIn(asUser, manager);
        const list = new UsersListPage(mp, tag);
        await list.goto();

        // Quinn's row (Actors paragraph; Rule 7). "Disable User" there is A1's.
        let labels = await list.menuLabels(list.row(mail(quinn)));
        expect(labels).toEqual(expect.arrayContaining(['Edit', 'Email', 'Remove User']));
        expect(labels).not.toContain('Login As');
        expect(labels).not.toContain('Merge user');

        // The Site Administrator's row (Rules 7, 15). "Remove User" and
        // "Disable User" there are A2's and A1's.
        labels = await list.menuLabels(list.row('admin@mail.test'));
        expect(labels).toEqual(expect.arrayContaining(['Edit', 'Email']));
        expect(labels).not.toContain('Login As');
        expect(labels).not.toContain('Merge user');

        // Nova's row: an ended role elsewhere puts her out of reach (Rule 7).
        const novaRow = list.row(mail(nova));
        labels = await list.menuLabels(novaRow);
        expect(labels).toEqual(expect.arrayContaining(['Edit', 'Email']));
        expect(labels).not.toContain('Merge user');

        // Nova disabled (Actors row 4; Rules 10, 13).
        const disable = new DisableUserWindow(mp, 'Disable Nova Reyes');
        await list.chooseAction(novaRow, 'Disable User');
        await disable.expectForm();
        await expect(disable.okButton).toBeVisible();
        await disable.ok();
        await expect(list.disabledIcon(novaRow)).toHaveCount(1);
        labels = await list.menuLabels(novaRow);
        expect(labels).toContain('Enable User');
        expect(labels).not.toContain('Disable User');

        // Control: Lena, wholly within reach, is offered "Merge user" (Rule 7).
        expect(await list.menuLabels(list.row(mail(lena)))).toContain('Merge user');
    });

    test('S5: remove a user from the journal', async ({asUser, ojsApi, browser, baseURL}, testInfo) => {
        const tag = makeTag(5, testInfo);
        const second = `${tag}b`;
        const manager = `m${tag}`;
        const secondManager = `mb${tag}`;
        const quinn = `q${tag}`;
        await ojsApi.createContext({
            tag: second,
            users: [
                {username: secondManager, givenName: 'Bo', familyName: 'Secondmanager', roles: ['manager']},
                {username: quinn, givenName: 'Quinn', familyName: 'Ashdown', roles: ['author']},
            ],
        });
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: 'Mara', familyName: 'Scratchmanager', roles: ['manager']},
                {username: quinn, roles: ['author', 'reader']},
            ],
        });
        const mp = await signedIn(asUser, manager);
        const list = new UsersListPage(mp, tag);
        const remove = new RemoveUserDialog(mp);
        await list.goto();
        const quinnRow = list.row(mail(quinn));
        await expect(list.rolesCell(quinnRow)).toHaveText(/Author/);
        expect((await list.cellLines(list.rolesCell(quinnRow))).sort()).toEqual(['Author', 'Reader']);

        // "Cancel" (Rule 14).
        await list.chooseAction(quinnRow, 'Remove User');
        await remove.expectOpen();
        await expect(remove.dialog.getByRole('heading', {name: 'Remove', exact: true})).toBeVisible();
        await expect(remove.sentence(REMOVE_SENTENCE)).toBeVisible();
        await expect(remove.okButton).toBeVisible();
        await remove.cancel();
        expect((await list.cellLines(list.rolesCell(quinnRow))).sort()).toEqual(['Author', 'Reader']);

        // Removed (Rules 3, 14). The row kept with no role is A3's claim and
        // the silence towards Quinn A8's; neither is asserted.
        await list.chooseAction(quinnRow, 'Remove User');
        await remove.expectOpen();
        const removed = await remove.ok();
        expect(removed.status()).toBe(200);

        // Her roles page: Author and Reader ended today (Rule 14).
        await list.chooseAction(quinnRow, 'Edit');
        await mp.waitForURL(/\/management\/settings\/user\/\d+/, {waitUntil: 'commit'});
        const rolesTable = mp.getByRole('main').getByRole('table');
        for (const role of ['Author', 'Reader']) {
            const roleRow = rolesTable.getByRole('row').filter({has: mp.getByRole('cell', {name: role, exact: true})});
            await expect(roleRow.getByRole('cell').nth(2)).toHaveText(today());
            await expect(roleRow).toContainText('User Removed From Role');
        }

        // Quinn signs in: her account untouched (Rule 14).
        const {context, page: qp} = await anonPage(browser, baseURL);
        try {
            const login = new LoginPage(qp);
            await login.goto();
            await login.signIn(quinn, pw(quinn));
        } finally {
            await context.close();
        }

        // Control: the second journal still lists her as Author (Rule 14).
        const bp = await signedIn(asUser, secondManager);
        const secondList = new UsersListPage(bp, second);
        await secondList.goto();
        await expect(secondList.rolesCell(secondList.row(mail(quinn)))).toHaveText('Author');
    });

    test('S6: merge a duplicate account', async ({asUser, ojsApi, browser, baseURL}, testInfo) => {
        test.slow();
        const tag = makeTag(6, testInfo);
        const manager = `m${tag}`;
        const ash = `qa${tag}`;
        const ashdown = `qd${tag}`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: 'Mara', familyName: 'Scratchmanager', roles: ['manager']},
                {username: ash, givenName: 'Quinn', familyName: 'Ash', roles: ['author', 'reader']},
                {username: ashdown, givenName: 'Quinn', familyName: 'Ashdown', roles: ['author']},
            ],
        });
        const submission = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: ash,
            title: 'Tidal Patterns',
        });

        // Quinn Ash, signed in in a second browser.
        const qp = await signedIn(asUser, ash);
        await qp.goto(`/index.php/${tag}/user/profile`);
        await expect(qp.locator('h1.app__pageHeading')).toHaveText('Profile');

        const mp = await signedIn(asUser, manager);
        const list = new UsersListPage(mp, tag);
        const merge = new MergeUserWindow(mp);
        await list.goto();

        // The "Merge user" window (Rule 16; Fields, the shared list).
        await list.chooseAction(list.row(mail(ash)), 'Merge user');
        await merge.expectOpen();
        await expect(merge.grid.title('Merge into this User')).toBeVisible();
        expect(await merge.grid.columns()).toEqual(GRID_COLUMNS);
        for (const address of ['admin@mail.test', mail(manager), mail(ashdown)]) {
            await expect(merge.grid.row(address)).toHaveCount(1);
        }
        await expect(merge.grid.row(mail(ash))).toHaveCount(1);
        await expect(merge.grid.arrow(mail(ashdown))).toHaveCount(1);
        await expect(merge.grid.arrow(mail(ash))).toHaveCount(0);
        for (const address of [mail(ashdown), mail(manager), 'admin@mail.test']) {
            expect(await merge.grid.actionLabels(address)).toContain('Merge into this User');
        }

        // The search form (Fields, the shared search form).
        await merge.grid.openSearchForm();
        await expect(merge.grid.searchInput).toHaveValue('');
        expect(await merge.grid.selectedRole()).toBe('All Roles');
        await expect(merge.grid.noRoleLabel(NO_ROLE_BOX)).toBeVisible();
        await expect(merge.grid.noRoleBox).not.toBeChecked();
        await merge.grid.search({text: 'Ashdown'});
        await expect(merge.grid.rows()).toHaveCount(1);
        await expect(merge.grid.row(mail(ashdown))).toBeVisible();

        // "Cancel" (Rule 17).
        await merge.mergeInto(mail(ashdown));
        expect(await merge.confirmText()).toBe(
            `Are you sure you wish to merge the account with the username "${ash}" into the account with the username "${ashdown}"? ` +
                `The account with the username "${ash}" will not exist afterwards. This action is not reversible.`
        );
        await merge.cancelConfirm();
        await expect(merge.dialog.getByRole('heading', {name: 'Merge user', exact: true})).toBeVisible();

        // Merged (Rule 17).
        await merge.mergeInto(mail(ashdown));
        const merged = await merge.confirm();
        expect(merged.status()).toBe(200);
        await merge.expectClosed();
        const ashdownRow = list.row(mail(ashdown));
        await expect(ashdownRow).toBeVisible();
        await expect(list.row(mail(ash))).toHaveCount(0);
        await expect.poll(async () => (await list.cellLines(list.rolesCell(ashdownRow))).sort()).toEqual([
            'Author',
            'Reader',
        ]);

        // The submission's Participants panel (Rule 17).
        const panel = new ParticipantsPanel(mp, tag);
        await panel.goto(submission.submissionId);
        await expect(panel.row('Quinn Ashdown')).toHaveCount(1);
        await expect(panel.row('Quinn Ash')).toHaveCount(0);

        // Quinn Ash, in the second browser: signed out, and refused (Rule 17).
        await qp.goto(`/index.php/${tag}/user/profile`);
        await expect(qp.locator('form#login')).toBeVisible();
        const login = new LoginPage(qp);
        await login.gotoContext(tag);
        await login.submitCredentials(ash, pw(ash));
        await expect(qp.getByText('Invalid username/email or password. Please try again.')).toBeVisible();

        // Control: the account is gone, not left without a role (Rules 16,
        // 17). The same search finds Quinn Ashdown by her username first.
        await list.goto();
        await list.chooseAction(list.row(mail(ashdown)), 'Merge user');
        await merge.expectOpen();
        await merge.grid.search({text: ashdown, includeNoRole: true});
        await expect(merge.grid.rows()).toHaveCount(1);
        await expect(merge.grid.row(mail(ashdown))).toBeVisible();
        await merge.grid.search({text: ash, includeNoRole: true});
        await expect(merge.grid.rows()).toHaveCount(0);
    });

    // S1, S7 and S8 act as `admin`. A refused legacy form's message
    // reaches the page as a notification that the next page of the same
    // account fetches and clears (patterns.md parallel lesson 2), so the
    // three run one after another in one worker, never beside each other.
    test.describe('the Site Administrator\'s steps', () => {
        test.describe.configure({mode: 'default'});

        test('S1: find a user in the "Users" list', async ({asUser, ojsApi}, testInfo) => {
            test.slow();
            const tag = makeTag(1, testInfo);
            const manager = `m${tag}`;
            const quinn = `q${tag}`;
            const nova = `n${tag}`;
            const readers = Array.from({length: 28}, (_, i) => {
                const n = String(i + 1).padStart(2, '0');
                return {username: `r${n}${tag}`, givenName: `Page${n}`, familyName: 'Filler', roles: ['reader']};
            });
            await ojsApi.createContext({
                tag,
                users: [
                    {username: manager, givenName: 'Mara', familyName: 'Scratchmanager', roles: ['manager']},
                    {
                        username: quinn,
                        givenName: 'Quinn',
                        familyName: 'Ashdown',
                        roles: ['author'],
                        affiliation: 'Harbour University',
                        orcid: ORCID_ID,
                        orcidIsVerified: false,
                    },
                    {username: nova, givenName: 'Nova', familyName: 'Reyes', roles: ['reader'], pastRoles: [{role: 'author'}]},
                    ...readers,
                ],
            });

            const mp = await signedIn(asUser, manager);
            const list = new UsersListPage(mp, tag);

            // The page (Rules 1, 2, 4; Settings bullet 1): no "Notify" tab, the
            // other four tabs read in the same row as its control.
            await list.goto();
            await expect(list.pageHeading).toHaveText('Users & Roles');
            expect(await list.settings.topTabNames()).toEqual(['Users', 'Roles', 'Site Access Options', 'ORCID']);
            await expect(list.invitationsHeading()).toBeVisible();
            await expect(list.inviteButton).toBeVisible();
            await expect(list.invitationsTable).toBeVisible();
            await expect(list.usersHeading(32)).toBeVisible();
            const invitationsTop = (await list.invitationsTable.boundingBox()).y;
            const usersTop = (await list.table.boundingBox()).y;
            expect(invitationsTop).toBeLessThan(usersTop);

            // The first page (Rules 4, 5; Fields).
            const rows = list.rows();
            await expect(rows).toHaveCount(25);
            const adminRow = rows.nth(0);
            await expect(list.nameCell(adminRow)).toHaveText('admin admin');
            await expect(list.rolesCell(adminRow)).toHaveText(MANAGER_ROLE);
            await expect(list.startDateCell(adminRow)).toHaveText('');
            await expect(list.emailCell(rows.nth(1))).toHaveText(mail(manager));
            const quinnRow = rows.nth(2);
            await expect(list.nameCell(quinnRow)).toHaveText('Quinn Ashdown');
            await expect(list.orcidIcon(quinnRow)).toHaveCount(1);
            await expect(list.orcidIcon(rows.nth(1))).toHaveCount(0);
            await expect(list.rolesCell(quinnRow)).toHaveText('Author');
            await expect(list.startDateCell(quinnRow)).toHaveText(today());
            await expect(list.affiliationCell(quinnRow)).toHaveText('Harbour University');
            const novaRow = rows.nth(3);
            await expect(list.nameCell(novaRow)).toHaveText('Nova Reyes');
            await expect(list.rolesCell(novaRow)).toHaveText('Reader');
            await list.expectPagingLine('Showing 1 to 25 of 32');
            await expect(list.pageButton(2)).toBeVisible();

            // The second page: the last 7 rows (Rule 5).
            await list.gotoListPage(2);
            await expect(list.table.locator('tbody tr td:first-child')).toHaveText(
                ['22', '23', '24', '25', '26', '27', '28'].map((n) => `Page${n} Filler`)
            );

            // A search: typing alone changes nothing, Enter runs it (Rules 4, 6a, 6b).
            const harbourRequests = [];
            mp.on('request', (request) => {
                if (/\/api\/v1\/users\?/.test(request.url()) && /searchPhrase=harbour/i.test(request.url())) {
                    harbourRequests.push(request.url());
                }
            });
            await list.typeSearch('harbour');
            await expect(list.usersHeading(32)).toBeVisible();
            await expect(rows).toHaveCount(7);
            await list.search('harbour');
            expect(harbourRequests, 'one search request, the one Enter sent').toHaveLength(1);
            await expect(list.usersHeading(1)).toBeVisible();
            await expect(rows).toHaveCount(1);
            await expect(list.nameCell(rows.first())).toHaveText('Quinn Ashdown');

            // An ended role found (Rule 6b).
            await list.clearSearch();
            await expect(list.usersHeading(32)).toBeVisible();
            await expect(rows).toHaveCount(25);
            await list.search('Nova Author');
            await expect(list.usersHeading(1)).toBeVisible();
            await expect(rows).toHaveCount(1);
            await expect(list.nameCell(rows.first())).toHaveText('Nova Reyes');
            await expect(list.rolesCell(rows.first())).toHaveText('Reader');

            // No match: two words matching two accounts find neither (Rules 6b, 6c).
            await list.search('Quinn Nova');
            await expect(list.usersHeading(0)).toBeVisible();
            await expect(rows).toHaveCount(1);
            await expect(rows.first()).toHaveText('No Items');
            await list.expectPagingLine('Showing 0 to 0 of 0');

            // The Journal Manager's own row: "Edit" and "Email" only (Rule 7).
            await list.clearSearch();
            await expect(list.usersHeading(32)).toBeVisible();
            const ownRow = rows.nth(1);
            await expect(list.emailCell(ownRow)).toHaveText(mail(manager));
            expect(await list.menuLabels(ownRow)).toEqual(['Edit', 'Email']);

            // Control: Quinn's row offers the rest (Rule 7).
            expect(await list.menuLabels(list.row(mail(quinn)))).toEqual(
                expect.arrayContaining(['Edit', 'Email', 'Remove User', 'Disable User', 'Merge user'])
            );

            // The Site Administrator's grid, in a second browser (Rule 19).
            const ap = await signedIn(asUser, 'admin');
            const hosted = new HostedContextsPage(ap, LABELS);
            await hosted.gotoFromAdministration();
            await hosted.openSettingsWizard(tag);
            const grid = await hosted.openWizardTab('Users');
            await expect(grid.title('Current Users')).toBeVisible();
            expect(await grid.columns()).toEqual(GRID_COLUMNS);
            await expect(grid.searchLink()).toBeVisible();
            await expect(grid.addUserLink()).toBeVisible();
            expect(await grid.pagingLine()).toMatch(/^Items per page: 10 25 50 75 100 /);
            await expect(grid.pageLinks().filter({hasText: /^\s*2\s*$/})).toBeVisible();
        });

        test('S7: the Site Administrator adds a user', async ({asUser, ojsApi, pkpMail, browser, baseURL}, testInfo) => {
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

        test('S8: the Site Administrator changes a user\'s roles on "Edit User"', async ({
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
});
