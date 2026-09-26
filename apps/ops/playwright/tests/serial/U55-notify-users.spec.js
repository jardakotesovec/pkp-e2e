// @ts-check
/**
 * @file playwright/tests/serial/U55-notify-users.spec.js
 *
 * Notify users (bulk email) — OPS suite, the serial part: scenarios 1, 2, 4
 * and 5, each of which ends "once the site's background jobs have run".
 * Scenario 3 is in ../U55-notify-users.spec.js, whose header lists what
 * the suite deliberately does not cover (A1–A4, every one a 🐞).
 * Spec: docs/specs/U55-notify-users.md
 *
 * Why serial: the emails are queued, and runJobs() drains the SHARED queue,
 * so every test that reads the mail after a drain belongs in the serial
 * project (patterns.md parallel lesson 7; PRINCIPLES A9). S5 also carries
 * `@solo`: its Site Administrator unticks the server on Administration ›
 * Site Settings › "Bulk Emails", whose "Save" posts the whole site-wide
 * list as its page loaded it (scenarios.md, `bulkEmails`), so a scratch
 * context another worker seeds between that page's load and its "Save"
 * would be unticked with it. Alone in the `ops-solo` project nothing seeds
 * meanwhile (harness.md "Project chain"). The scenario API has no key that
 * unticks an existing context, and the untick is the behavior under test.
 *
 * Seeding (footnote s): a scratch preprint server from `POST
 * scenarios/context` with `bulkEmails: true` and throwaway accounts (the
 * username twice as password, `<username>@mail.test`), the first a
 * Preprint Server Manager. The Site Administrator is `admin`, enrolled as
 * a manager of every scratch server. S1 names the server's principal
 * contact, so the sender the email carries is the test's own and is read
 * back on Settings › Server › "Contact". The wizard's first tab is
 * "Server Settings", the Administration list "Hosted Servers", and the
 * refusals end "…for this server.". Every actor is opened through `asUser` (patterns.md "Fixture
 * selection"). Mail is read by recipient address after the test's own
 * drain; every "none" is read after a message sent the same way to a
 * recipient of the same send arrived (A8), or, where the scenario sends
 * nothing, bounded by the send's own refused answer.
 */
const {test, expect} = require('../../support/fixtures.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');
const {HostedContextsPage} = require('../../../../../shared/playwright/pages/UsersManagementPages.js');
const {RolesTab} = require('../../../../../shared/playwright/pages/RolesConfigurationPages.js');
const {SettingsPages} = require('../../../../../shared/playwright/pages/ContextIdentityPages.js');
const {
    NotifyTab,
    RestrictBulkEmailsTab,
    SiteBulkEmailsTab,
    isSend,
} = require('../../../../../shared/playwright/pages/NotifyUsersPages.js');

const LABELS = {hostedLabel: 'Hosted Servers'};
const WIZARD = {firstTab: 'Server Settings'};
const STAGES = ['Production'];
const ROLES_DESCRIPTION = 'Select the users who should receive your email notification.';
/** The "Email" toolbar's buttons, left to right (Fields, the "Notify" tab). */
const TOOLBAR = ['Bold', 'Italic', 'Superscript', 'Subscript', 'Insert/edit link'];
const QUEUED = 'Emails are successfully queued to be sent at the earliest convenience.';
const confirmText = (total) =>
    `You are about to send an email to ${total} users. Are you sure you want to send this email?`;
const notSaved = (n) =>
    `The form was not saved because ${n} error(s) were encountered. Please correct these errors and try again.`;
const NO_ROLES = 'You must indicate the user roles that should receive this email.';
const NO_SUBJECT = 'You must provide a subject for the email.';
const NO_BODY = 'You must include an email to be sent.';
const NOT_ALLOWED_ROLE = 'You are not allowed to send an email to users in one or more of the selected roles.';
const NOT_ENABLED = 'The email notification feature has not been enabled for this server.';
const DISABLED_SENTENCE =
    'The bulk email feature has been disabled for this server. Enable this feature in Admin > Site Settings.';
/** "Closes itself after about five seconds": bounded well above that. */
const NOTICE_LIFETIME = 15_000;

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u55s${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** The seeded address rule. */
const mail = (username) => `${username}@mail.test`;

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles, more = {}) {
    return {username, givenName, familyName, roles, ...more};
}

/** A signed-in page for an actor (a fresh `asUser` context). */
async function signedIn(asUser, username) {
    const context = await asUser(username);
    return context.newPage();
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

/** Record every "Notify" send a page makes (status per answer). */
function recordSends(page) {
    const sends = [];
    page.on('response', (response) => {
        if (isSend(response)) {
            sends.push(response.status());
        }
    });
    return sends;
}

/** A message's text with its markup removed. */
const plain = (html) => (html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Sorted copy. */
const sorted = (list) => [...list].sort();

/** A notice at the top right shows and then closes itself (Rule 7). */
async function expectPassingNotice(notify, text) {
    await expect(notify.notice(text)).toBeVisible();
    await expect(notify.notice(text)).toBeHidden({timeout: NOTICE_LIFETIME});
}

test.describe('notify users (serial)', () => {
    test('S1: send an email to one role, then to two with a copy', async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag(1, testInfo);
        const [manager, quinn, nova, lena, rui, kai] = ['m', 'q', 'n', 'l', 'r', 'k'].map((p) => `${p}${tag}`);
        const contact = {name: 'Ines Principal', email: mail(`c${tag}`)};
        await opsApi.createContext({
            tag,
            bulkEmails: true,
            context: {contactName: contact.name, contactEmail: contact.email},
            users: [
                user(manager, 'Mara', 'Scratchmanager', ['manager']),
                user(quinn, 'Quinn', 'Ashdown', ['author']),
                user(nova, 'Nova', 'Reyes', ['author'], {disabled: true}),
                user(lena, 'Lena', 'Ortiz', ['author', 'reader']),
                user(rui, 'Rui', 'Tanaka', ['reader']),
                user(kai, 'Kai', 'Moreno', [], {pastRoles: [{role: 'author'}]}),
            ],
        });
        const mp = await signedIn(asUser, manager);
        const notify = new NotifyTab(mp, tag);

        // The tab (Rule 1; Fields, the "Notify" tab).
        await notify.gotoPage();
        const tabs = await notify.settings.topTabNames();
        const at = tabs.indexOf('Notify');
        expect(at, `tabs: ${tabs.join(', ')}`).toBeGreaterThan(0);
        expect(tabs[at - 1]).toBe('Roles');
        expect(tabs[at + 1]).toBe('Site Access Options');
        await notify.open();
        await expect(notify.fieldLabel(notify.rolesField)).toHaveText(/^\s*Roles\s*$/);
        await expect(notify.fieldDescription(notify.rolesField)).toHaveText(ROLES_DESCRIPTION);
        expect(await notify.roleLabels()).toEqual(expect.arrayContaining(['Author', 'Reader']));
        expect(await notify.checkedRoles()).toEqual([]);
        await expect(notify.fieldLabel(notify.subjectField)).toHaveText(/^\s*Subject\s*$/);
        await expect(notify.subject).toHaveValue('');
        await expect(notify.fieldLabel(notify.bodyField)).toHaveText(/^\s*Email\s*$/);
        expect(plain(await notify.bodyContent())).toBe('');
        expect(await notify.toolbarButtons()).toEqual(TOOLBAR);
        await expect(notify.fieldLabel(notify.copyField)).toHaveText(/^\s*Copy\s*$/);
        await expect(notify.copyBox).toHaveCount(1);
        await expect(notify.copyBox).not.toBeChecked();
        await expect(notify.copyField.getByRole('checkbox', {name: `Send a copy of this email to me at ${mail(manager)}.`, exact: true})).toHaveCount(1);

        // One role (Rules 4, 5): Quinn and Lena counted, Nova (disabled) and
        // Kai (role ended) not. The button pressed is A1's.
        await notify.fill({roles: ['Author'], subject: 'Office closed', body: 'Dear {$recipientName}, the office is closed.'});
        let window = await notify.pressSubmit();
        await expect(window.title).toHaveText('Send Email');
        expect(await window.message()).toBe(confirmText(2));
        expect(await window.buttonLabels()).toEqual(['Send Email', 'Cancel']);

        // Queued (Rule 8).
        let response = await window.sendAndWait();
        expect(response.status()).toBe(200);
        await expect(notify.queuedLine).toContainText(QUEUED);
        await expect(notify.queuedLine.locator('svg').first()).toBeVisible();
        await expect(notify.sendAnotherButton).toBeVisible();
        await expect(notify.sendAnotherButton).toHaveClass(/-linkButton/);
        await expect(notify.form).toHaveCount(0);

        // The emails (Side effects): one each to Quinn and Lena, addressed to
        // them alone, from the principal contact, the text as typed.
        runJobs();
        const contactPage = await mp.context().newPage();
        const contactForm = await new SettingsPages(contactPage, tag).openJournalTab('Contact');
        await expect(contactForm.control('contact-contactName-control')).toHaveValue(contact.name);
        await expect(contactForm.control('contact-contactEmail-control')).toHaveValue(contact.email);
        await contactPage.close();
        for (const who of [quinn, lena]) {
            const summary = await pkpMail.find({to: mail(who), subject: 'Office closed'});
            expect(await pkpMail.count({to: mail(who), subject: 'Office closed'}), `${who}: one "Office closed"`).toBe(1);
            const message = await pkpMail.fullMessage(summary.ID);
            expect(message.Subject).toBe('Office closed');
            expect(message.From).toEqual(expect.objectContaining({Name: contact.name, Address: contact.email}));
            expect(message.To.map((t) => t.Address)).toEqual([mail(who)]);
            expect(message.Cc || []).toEqual([]);
            expect(plain(message.HTML)).toBe('Dear {$recipientName}, the office is closed.');
        }
        for (const who of [nova, kai]) {
            await pkpMail.expectNone({to: mail(who), subject: 'Office closed', afterControl: {to: mail(quinn), subject: 'Office closed'}});
        }

        // "Send another email" (Rule 8).
        await notify.sendAnother();
        expect(await notify.checkedRoles()).toEqual([]);
        await expect(notify.subject).toHaveValue('');
        expect(plain(await notify.bodyContent())).toBe('');

        // Two roles and a copy (Rules 2, 8); the window's total is A3's.
        await notify.fill({roles: ['Author', 'Reader'], subject: 'Library hours', body: 'The library opens at nine.', copy: true});
        window = await notify.pressSubmit();
        response = await window.sendAndWait();
        expect(response.status()).toBe(200);
        await expect(notify.queuedLine).toContainText(QUEUED);

        // The emails again: exactly one each, Lena's included, and the copy.
        runJobs();
        for (const who of [quinn, lena, rui, manager]) {
            await pkpMail.find({to: mail(who), subject: 'Library hours'});
            expect(await pkpMail.count({to: mail(who), subject: 'Library hours'}), `${who}: one "Library hours"`).toBe(1);
        }
        for (const who of [nova, kai]) {
            await pkpMail.expectNone({to: mail(who), subject: 'Library hours', afterControl: {to: mail(quinn), subject: 'Library hours'}});
        }

        // Control: Rui and the Preprint Server Manager have no "Office closed".
        for (const who of [rui, manager]) {
            await pkpMail.expectNone({to: mail(who), subject: 'Office closed', afterControl: {to: mail(quinn), subject: 'Office closed'}});
        }
    });

    test('S2: the roles offered, and a form refused, cancelled and left', async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.setTimeout(180_000);
        const tag = makeTag(2, testInfo);
        const manager = `m${tag}`;
        const quinn = `q${tag}`;
        await opsApi.createContext({
            tag,
            bulkEmails: true,
            customRoles: [
                {key: 'dataCurator', level: 'assistant', name: 'Data curator', abbrev: 'DC'},
                {key: 'spareDesk', level: 'assistant', name: 'Spare desk', abbrev: 'SD'},
            ],
            users: [user(manager, 'Mara', 'Scratchmanager', ['manager']), user(quinn, 'Quinn', 'Ashdown', ['dataCurator'])],
        });
        const mp = await signedIn(asUser, manager);
        const questions = recordQuestions(mp);
        const sends = recordSends(mp);
        const roles = new RolesTab(mp, tag, {stages: STAGES});
        const notify = new NotifyTab(mp, tag);

        // The roles offered (Rule 3; Fields).
        await roles.goto();
        const allRoles = await roles.rowNames();
        expect(allRoles).toEqual(expect.arrayContaining(['Data curator', 'Spare desk']));
        await notify.open();
        expect(sorted(await notify.roleLabels())).toEqual(sorted(allRoles));
        expect(await notify.checkedRoles()).toEqual([]);

        // Nothing filled in (Rule 7; Fields). The window's total is A2's.
        let window = await notify.pressSubmit();
        const refused = await window.sendAndWait();
        expect(refused.status()).toBe(400);
        await expectPassingNotice(notify, notSaved(3));
        await expect(notify.fieldError(notify.rolesField)).toHaveText(NO_ROLES);
        await expect(notify.fieldError(notify.subjectField)).toHaveText(NO_SUBJECT);
        await expect(notify.fieldError(notify.bodyField)).toHaveText(NO_BODY);
        await expect(notify.errorLine).toContainText('Please correct 3 errors.');
        await expect(notify.jumpButton).toBeVisible();
        await expect(notify.submitButton).toBeDisabled();

        // Filled in one by one (Rule 7).
        await notify.subject.fill('Board meeting');
        await expect(notify.submitButton).toBeDisabled();
        await notify.typeBody('The board meets on Monday.');
        await expect(notify.submitButton).toBeDisabled();
        await notify.roleBox('Data curator').check();
        await expect(notify.submitButton).toBeEnabled();

        // One member (Rule 4).
        window = await notify.pressSubmit();
        expect(await window.message()).toBe(confirmText(1));

        // Cancelled (Rule 6).
        await window.cancel();
        const expectTyped = async () => {
            expect(await notify.checkedRoles()).toEqual(['Data curator']);
            await expect(notify.subject).toHaveValue('Board meeting');
            expect(plain(await notify.bodyContent())).toBe('The board meets on Monday.');
        };
        await expectTyped();

        // Another tab and back (Rule 6).
        await roles.openTab();
        await notify.open();
        await expectTyped();

        // The page left: nothing asks, and the form is empty again (Rule 6).
        await notify.settings.openSettingsEntry('Server');
        await expect(notify.settings.heading).toHaveText('Server Settings');
        expect(questions).toEqual([]);
        await notify.goto();
        expect(await notify.checkedRoles()).toEqual([]);
        await expect(notify.subject).toHaveValue('');
        expect(plain(await notify.bodyContent())).toBe('');

        // Control: the one send the page made was refused, and after the
        // jobs have run Quinn has no "Board meeting" (Rule 6).
        expect(sends).toEqual([400]);
        runJobs();
        expect(await pkpMail.count({to: mail(quinn), subject: 'Board meeting'})).toBe(0);
    });

    test('S4: a role restricted while the manager\'s page is open', async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.setTimeout(180_000);
        const tag = makeTag(4, testInfo);
        const manager = `m${tag}`;
        const quinn = `q${tag}`;
        await opsApi.createContext({
            tag,
            bulkEmails: true,
            users: [user(manager, 'Mara', 'Scratchmanager', ['manager']), user(quinn, 'Quinn', 'Ashdown', ['author'])],
        });
        const mp = await signedIn(asUser, manager);
        const ap = await signedIn(asUser, 'admin');
        const sends = recordSends(mp);
        const notify = new NotifyTab(mp, tag);
        await notify.goto();

        // The form filled.
        await notify.fill({roles: ['Author'], subject: 'Office closed', body: 'The office is closed on Friday.'});

        // The Site Administrator ticks "Author" (Rules 11, 12).
        const hosted = new HostedContextsPage(ap, LABELS);
        await hosted.gotoFromAdministration();
        await hosted.openSettingsWizard(tag);
        const restrict = new RestrictBulkEmailsTab(ap, WIZARD);
        await restrict.open();
        await restrict.box('Author').check();
        await restrict.save();

        // The send refused (Rules 7, 10).
        await expect(notify.roleBox('Author')).toBeChecked();
        const window = await notify.pressSubmit();
        const refused = await window.sendAndWait();
        expect(refused.ok(), `the send answers ${refused.status()}`).toBe(false);
        await expectPassingNotice(notify, notSaved(1));
        await expect(notify.fieldError(notify.rolesField)).toHaveText(NOT_ALLOWED_ROLE);
        await expect(notify.errorLine).toContainText('Please correct one error.');
        await expect(notify.jumpButton).toBeVisible();
        await expect(notify.submitButton).toBeDisabled();

        // "Roles" changed (Rule 10).
        await notify.roleBox('Author').uncheck();
        await expect(notify.submitButton).toBeEnabled();

        // Control: after a reload "Author" is not offered (Rule 12); the one
        // send was refused, and after the jobs Quinn has no email (Rule 10).
        await mp.reload();
        await notify.open();
        await expect(notify.roleBox('Author')).toHaveCount(0);
        await expect(notify.roleBox('Reader')).toHaveCount(1);
        expect(sends).toEqual([refused.status()]);
        runJobs();
        expect(await pkpMail.count({to: mail(quinn), subject: 'Office closed'})).toBe(0);
    });

    test('S5: bulk email withdrawn while the manager\'s page is open @solo', async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.setTimeout(180_000);
        const tag = makeTag(5, testInfo);
        const manager = `m${tag}`;
        const quinn = `q${tag}`;
        await opsApi.createContext({
            tag,
            bulkEmails: true,
            users: [user(manager, 'Mara', 'Scratchmanager', ['manager']), user(quinn, 'Quinn', 'Ashdown', ['author'])],
        });
        const mp = await signedIn(asUser, manager);
        const ap = await signedIn(asUser, 'admin');
        const sends = recordSends(mp);
        const notify = new NotifyTab(mp, tag);

        // The bookmark (Rule 1): open() returns once the address carries `#notify`.
        await notify.goto();
        const bookmark = mp.url();
        await notify.settings.goto('journal');
        await mp.goto(bookmark);
        await expect(notify.tab).toHaveAttribute('aria-selected', 'true');
        await notify.ready();

        // The form filled.
        await notify.fill({roles: ['Author'], subject: 'Office closed', body: 'The office is closed on Friday.'});

        // The Site Administrator unticks the server (Settings bullet 1).
        const site = new SiteBulkEmailsTab(ap);
        await site.goto();
        const box = site.box(`Scratch context ${tag}`);
        await expect(box).toBeChecked();
        await box.uncheck();
        await site.save();

        // The send refused by a passing notice; the form as it was (Rule 10).
        await expect(notify.tab).toBeVisible();
        const window = await notify.pressSubmit();
        const refused = await window.sendAndWait();
        expect(refused.ok(), `the send answers ${refused.status()}`).toBe(false);
        await expectPassingNotice(notify, NOT_ENABLED);
        expect(await notify.checkedRoles()).toEqual(['Author']);
        await expect(notify.subject).toHaveValue('Office closed');
        expect(plain(await notify.bodyContent())).toBe('The office is closed on Friday.');
        await expect(notify.submitButton).toBeEnabled();

        // Reloaded: no "Notify"; the bookmark opens on "Users" (Rules 1, 10).
        await mp.reload();
        const tabs = await notify.settings.topTabNames();
        expect(tabs).toContain('Roles');
        expect(tabs).not.toContain('Notify');
        await notify.settings.goto('journal');
        await mp.goto(bookmark);
        await expect(notify.settings.topTabs.first()).toBeVisible();
        await expect(mp.getByRole('tab', {name: 'Users', exact: true})).toHaveAttribute('aria-selected', 'true');
        await expect(notify.tab).toHaveCount(0);

        // "Restrict Bulk Emails" on a server not allowed (Rule 11).
        const hosted = new HostedContextsPage(ap, LABELS);
        await hosted.gotoFromAdministration();
        await hosted.openSettingsWizard(tag);
        const restrict = new RestrictBulkEmailsTab(ap, WIZARD);
        await restrict.open();
        expect(await restrict.text()).toBe(DISABLED_SENTENCE);
        await expect(restrict.boxes).toHaveCount(0);
        await expect(restrict.saveButton).toHaveCount(0);
        await restrict.siteSettingsLinks.click();
        await ap.waitForURL(/\/admin\/settings/, {waitUntil: 'commit'});
        await new SiteBulkEmailsTab(ap).expectOpen();

        // Control: the one send was refused, and after the jobs Quinn has no
        // "Office closed" (Rule 10).
        expect(sends).toEqual([refused.status()]);
        runJobs();
        expect(await pkpMail.count({to: mail(quinn), subject: 'Office closed'})).toBe(0);
    });
});
