// @ts-check
/**
 * @file playwright/tests/U05-notifications-center-and-email-preferences.spec.js
 *
 * Notifications center & email preferences — OJS suite, one test per
 * canonical scenario the spec runs on OJS (scenarios 1–8 here; scenario 9,
 * the OJS-only issue email, needs the queue drained and lives in
 * `serial/U05-notifications-center-and-email-preferences.spec.js`).
 * Spec: docs/specs/U05-notifications-center-and-email-preferences.md
 *
 * Deliberately NOT covered (one line per omission, citing the register ID or
 * rule):
 * - A10 🐞 (the "needs an editor" email arrives with "Enable…" unticked): S3
 *   asserts the task side of the rule and Manager B's email as the control;
 *   Manager A's mailbox is not read either way.
 * - A1 🐞 ("Discussion activity." governs nothing) and Rule 6's discussion
 *   reply: no reply is written; S5 opens discussions only.
 * - A2 🐞 (the Unsubscribe page re-enables emails switched off earlier): S5
 *   and S6 unsubscribe accounts whose tab is at its defaults, so the page's
 *   boxes never overwrite an earlier choice.
 * - A3 🐞 (no reader-side count for a Section Editor) and Rule 4: the
 *   reader-side header's count is not asserted for any role.
 * - A4 ❓ (the site-level tab governs nothing): S7 reads the site-level tab's
 *   rows and never saves it.
 * - A5 ❓ / Rule 7c (the hidden mail-program headers), A6 ❓ / Rule 7d (no API
 *   secret: a configuration-file state, PRINCIPLES D9), A7 ❓ / Rule 7b's
 *   deletion (the link dies with its task): the footer link is opened only
 *   while its task exists; the headers are not read.
 * - A8 ❓ (two emails without the footer): the "needs an editor" email is
 *   asserted by subject only; its footer is neither asserted nor denied.
 * - A9 ❓ (the Unsubscribe page lists the statistics box on a journal whose
 *   email is off): every journal here keeps the statistics email on.
 * - Rule 2b's journal initials on a multi-journal account and its paging
 *   beyond 25 rows; Rule 2d's site-level bell; Rule 5d's site-level choices;
 *   Rule 6's other rows (announcements, versions, reviews, the scheduled
 *   emails); Rule 8a's three broken links; Rule 8d's stale page; Rule 8e's
 *   "user profile" link; Rule 9's notice and warning looks, stacking and the
 *   in-form password notice (User profile S8): rule details outside the
 *   canonical scenarios; not covered.
 * - Settings: the statistics email's other end has no passthrough key on
 *   `POST scenarios/context` yet and the spec states why no scenario needs
 *   one; not covered (scenarios.md "Configuring a scratch context").
 *
 * Isolation: every test seeds its own scratch journal with throwaway
 * accounts through the scenario endpoint (unique tags of at most 12
 * characters, so no password reaches the Register page's 32-character
 * cap); `publicknowledge` and the roster are only read (S7). Where the
 * scenario needs the "needs an editor" EMAIL, the Author submits through the
 * wizard from a seeded draft (a seeded `submitted: true` submission raises
 * the task but sends no email, seed-facts); where only the task is needed,
 * the seed suffices. Mailpit reads are scoped by the throwaway recipient
 * (PRINCIPLES A8) and every silence claim rides on a positive control. The
 * bell's number is asserted on a freshly loaded page or after the window
 * closed, never on the page that was open when the task was raised (Rule
 * 2a). Leaving the workflow page after a discussion save raises the
 * browser's leave-page prompt, so S5 and S6 answer it. No hard-coded waits.
 */
const {test, expect} = require('../support/fixtures.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {ProfilePage, SAVED_MESSAGE} = require('../../../../shared/playwright/pages/ProfilePage.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {
    TasksPanel,
    UnsubscribePage,
    DISCUSSION_TASK,
    successToasts,
} = require('../../../../shared/playwright/pages/NotificationsPages.js');
const {SubmissionWizardPage} = require('../pages/SubmissionWizardPage.js');
const {RegisterPage, RegistrationCompletePage} = require('../pages/RegistrationPages.js');
const {getPassword} = require('../../../../shared/playwright/data/users.js');

const JOURNAL = 'publicknowledge';
const NEEDS_EDITOR_TASK = 'A new article has been submitted to which an editor needs to be assigned.';
const NEEDS_EDITOR_SUBJECT = 'A new submission needs an editor to be assigned';
const NEEDS_EDITOR_SETTING = 'notificationEditorAssignmentRequired';
const DISCUSSION_SETTING = 'notificationNewQuery';
const DISCUSSIONS_PANEL = 'Desk Review Tasks & Discussions';
const NOTIFICATIONS_INTRO =
    'Select the system events that you wish to be notified about. Unchecking an item will prevent notifications of the event from showing up in the system and also from being emailed to you. Checked events will appear in the system and you have an extra option to receive or not the same notification by email.';

/** The tab's groups and rows on a journal (Fields). */
const OJS_TAB = [
    {
        group: 'Public Announcements',
        rows: [
            'A new announcement has been created.',
            'An issue has been published.',
            'An issue has been made open access.',
        ],
    },
    {
        group: 'Submission Events',
        rows: [
            'A new article, "Title," has been submitted.',
            'A new version of your submission, "Title", was published.',
            NEEDS_EDITOR_TASK,
            'Discussion added.',
            'Discussion activity.',
        ],
    },
    {group: 'Reviewing Events', rows: ['A reviewer has commented on "Title".']},
    {group: 'Editors', rows: ['Weekly email of outstanding tasks', 'Statistics report summary.']},
];

/** The site-level tab: the same without the statistics row (scenario 7). */
const SITE_TAB = OJS_TAB.map((entry) =>
    entry.group === 'Editors' ? {group: entry.group, rows: ['Weekly email of outstanding tasks']} : entry
);

/** The Public Announcements rows' setting names (Rule 5e, note s8). */
const PUBLIC_SETTINGS = ['notificationNewAnnouncement', 'notificationPublishedIssue', 'notificationOpenAccess'];

/**
 * Unique per-run tag: a single alphanumeric token, feature + scenario +
 * worker + random, at most 12 characters (a throwaway username is the tag
 * plus two letters, and its password the username twice: under the Register
 * page's 32-character cap).
 */
function makeTag(scenario, testInfo) {
    return `u5${scenario}w${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

const emailOf = (username) => `${username}@mail.test`;

/**
 * A scratch journal with the named throwaway accounts. `admin` is auto-
 * enrolled as a Manager too (seed-facts) and gets every Manager task, which
 * touches nothing these tests assert.
 */
async function seedJournal(ojsApi, tag, users) {
    await ojsApi.createContext({tag, users});
    return {path: tag, name: `Scratch context ${tag}`};
}

/**
 * The Author submits: from a seeded draft (title and abstract ride in from
 * the seed; sections have no editors, so nobody is assigned), the wizard is
 * driven from Upload Files to the footer's "Submit" and the dialog's
 * "Submit". The wizard's own request sends the "needs an editor" email.
 */
async function submitViaWizard(ojsApi, authorPage, journalPath, {tag, submitter, title}) {
    const {submissionId} = await ojsApi.createSubmission({
        tag,
        context: journalPath,
        submitter,
        title,
        submitted: false,
        participants: [],
    });
    const wizard = new SubmissionWizardPage(authorPage, journalPath);
    await wizard.goto(submissionId);
    await wizard.expectStep('Upload Files');
    await wizard.uploadFile();
    await wizard.continueTo('Details');
    await wizard.continueTo('Contributors');
    await wizard.continueTo('For the Editors');
    await wizard.continueToReview(submissionId);
    await expect(wizard.errorBanner()).toHaveCount(0);
    await wizard.submitAndConfirm();
    return submissionId;
}

/** The editorial dashboard of a journal (any editorial page carries the bell). */
async function gotoEditorial(page, journalPath) {
    await page.goto(`/index.php/${journalPath}/dashboard/editorial`);
    await expect(new TasksPanel(page).bell()).toBeVisible({timeout: 30_000});
}

/** The Author's editorial page (My Submissions carries the bell too). */
async function gotoMySubmissions(page, journalPath) {
    await page.goto(`/index.php/${journalPath}/dashboard/mySubmissions`);
    await expect(new TasksPanel(page).bell()).toBeVisible({timeout: 30_000});
}

/** Open the Notifications tab for the signed-in account on a journal. */
async function openNotificationsTab(page, journalPath) {
    const profile = new ProfilePage(page, journalPath);
    await profile.goto('notifications');
    return profile;
}

/**
 * The Manager opens a discussion with the Author (scenario 5's labels):
 * "Add" in the "Desk Review Tasks & Discussions" panel, a "Name", the
 * Author's box under "Participants", a message, "Save". Waits for the save
 * (`POST …/submissions/{id}/tasks`).
 */
async function addDiscussion(managerPage, {name, participantUsername, message}) {
    const panel = managerPage.locator('[data-cy="discussion-manager"]').first();
    await expect(panel.getByRole('heading', {name: DISCUSSIONS_PANEL})).toBeVisible({timeout: 30_000});
    await panel.getByRole('button', {name: 'Add', exact: true}).click();
    // The workflow page is itself an active side modal; the form is the one
    // stacked over it that carries the "Name" box.
    const modal = managerPage
        .locator('[data-cy="active-modal"]')
        .filter({has: managerPage.locator('input[name="title"]')});
    await modal.locator('input[name="title"]').fill(name);
    // The participant boxes render a moment after the form opens.
    const participantBox = modal.getByRole('checkbox', {name: new RegExp(participantUsername)});
    await expect(participantBox).toBeVisible({timeout: 30_000});
    await participantBox.check();
    const body = modal.frameLocator('iframe').first().locator('body');
    await body.click();
    await body.fill(message);
    const saved = managerPage.waitForResponse(
        (response) =>
            response.request().method() === 'POST' && /\/submissions\/\d+\/tasks$/.test(response.url()),
        {timeout: 30_000}
    );
    await modal.getByRole('button', {name: 'Save', exact: true}).click();
    const response = await saved;
    expect(response.ok(), `discussion save answered ${response.status()}`).toBe(true);
    await expect(modal).toHaveCount(0, {timeout: 30_000});
}

/** The discussion email to one recipient, with its footer's "unsubscribe" link. */
async function discussionEmail(pkpMail, {to, name}) {
    const summary = await pkpMail.find({to, subject: name});
    const full = await pkpMail.fullMessage(summary.ID);
    const link = pkpMail.extractLink(full.HTML, /^unsubscribe$/i);
    return {summary, full, link};
}

/** A fresh, explicitly-anonymous context (never inherits cached storage state). */
async function anonContext(browser, baseURL) {
    return browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
}

/** The tab's ticked "Do not send me an email…" boxes. */
function checkedEmailBoxes(profile) {
    return profile.form('notifications').locator('input[id^="emailNotification"]:checked');
}

/** All "Enable…" boxes ticked; all "Do not send me an email…" boxes as `emailTicked`. */
async function expectTabState(profile, {emailTicked}) {
    const allow = profile.allowBoxes();
    const email = profile.emailBoxes();
    const count = await allow.count();
    expect(count).toBeGreaterThan(0);
    await expect(email).toHaveCount(count);
    for (let i = 0; i < count; i++) {
        await expect(allow.nth(i)).toBeChecked();
        if (emailTicked) {
            await expect(email.nth(i)).toBeChecked();
        } else {
            await expect(email.nth(i)).not.toBeChecked();
        }
    }
}

test.describe('notifications center & email preferences', () => {
    test('S1: a submission raises a task, and the bell counts it', {tag: '@smoke'}, async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        const title = `Title ${tag}`;
        const journal = await seedJournal(ojsApi, tag, [
            {username: manager, givenName: 'Mona', familyName: 'Manager', roles: ['manager']},
            {username: author, givenName: 'Alba', familyName: 'Authorson', roles: ['author']},
        ]);

        // The Manager's page is open before the submission: no number.
        const managerPage = await (await asUser(manager)).newPage();
        const tasks = new TasksPanel(managerPage);
        await gotoEditorial(managerPage, journal.path);
        await tasks.expectCount(0);

        // The Author submits through the wizard.
        const authorPage = await (await asUser(author)).newPage();
        const submissionId = await submitViaWizard(ojsApi, authorPage, journal.path, {tag, submitter: author, title});

        // Bounded by the Manager's own email, the page open before the
        // submission still shows no number; a reload shows "1" (Rule 2a).
        await pkpMail.find({to: emailOf(manager), subject: NEEDS_EDITOR_SUBJECT, contains: title});
        await tasks.expectCount(0);
        await managerPage.reload();
        await tasks.expectCount(1);

        // The window: one bold row with the sentence and the title; the bell
        // greyed out with no number while it is open (Rules 2a, 2b).
        await tasks.open();
        await expect(tasks.rows()).toHaveCount(1);
        const row = tasks.rows().first();
        await tasks.expectUnread(row);
        await expect(tasks.sentence(row)).toHaveText(NEEDS_EDITOR_TASK);
        await expect(tasks.title(row)).toHaveText(title);
        await expect(tasks.bell()).toBeDisabled();
        await expect(tasks.bell()).toHaveText(/^\s*Tasks\s*$/);

        // Pressing the text opens the submissions dashboard with the workflow
        // in a panel headed with the Author's name and the title (Rule 2c).
        await tasks.openTask(row);
        await managerPage.waitForURL(new RegExp(`/${journal.path}/dashboard/editorial\\?.*workflowSubmissionId=${submissionId}`), {
            waitUntil: 'commit',
            timeout: 30_000,
        });
        const workflow = new WorkflowPage(managerPage, journal.path);
        await workflow.expectOpen(submissionId);
        await expect(workflow.header()).toContainText('Authorson');
        await expect(workflow.titleLine()).toContainText(title);

        // Back on an editorial page: no number; the row is read now.
        await gotoEditorial(managerPage, journal.path);
        await tasks.expectCount(0);
        await tasks.open();
        await expect(tasks.rows()).toHaveCount(1);
        await tasks.expectRead(tasks.row(title));
    });

    test('S2: Mark New, Mark Read, Delete', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        const journal = await seedJournal(ojsApi, tag, [
            {username: manager, roles: ['manager']},
            {username: author, roles: ['author']},
        ]);
        // Two submissions (a seeded submission raises the same task the
        // wizard does; no email is needed here).
        const titles = [`First ${tag}`, `Second ${tag}`];
        for (const title of titles) {
            await ojsApi.createSubmission({tag, context: journal.path, submitter: author, title});
        }

        const managerPage = await (await asUser(manager)).newPage();
        const tasks = new TasksPanel(managerPage);
        await gotoEditorial(managerPage, journal.path);
        await tasks.expectCount(2);

        // Two unread rows; "Mark Read" with nothing ticked changes nothing.
        await tasks.open();
        await expect(tasks.rows()).toHaveCount(2);
        await tasks.expectUnread(tasks.row(titles[0]));
        await tasks.expectUnread(tasks.row(titles[1]));
        await tasks.act('Mark Read', {expectRequest: false});
        await expect(tasks.rows()).toHaveCount(2);
        await tasks.expectUnread(tasks.row(titles[0]));
        await tasks.expectUnread(tasks.row(titles[1]));
        await expect(managerPage.locator('.pkpNotification')).toHaveCount(0);

        // Tick the first row, "Mark Read": regular type, box unticked; the
        // bell shows "1" once the window is closed (Rule 3).
        const firstTitle = (await tasks.title(tasks.rows().first()).innerText()).trim();
        await tasks.box(tasks.row(firstTitle)).check();
        await tasks.act('Mark Read');
        await tasks.expectRead(tasks.row(firstTitle));
        await expect(tasks.box(tasks.row(firstTitle))).not.toBeChecked();
        await tasks.close();
        await tasks.expectCount(1);

        // "Mark New" on the same row: bold again; the bell shows "2".
        await tasks.open();
        await tasks.box(tasks.row(firstTitle)).check();
        await tasks.act('Mark New');
        await tasks.expectUnread(tasks.row(firstTitle));
        await tasks.close();
        await tasks.expectCount(2);

        // "Delete" on both: gone at once, "No Items", no number; a reload
        // shows the same.
        await tasks.open();
        await tasks.box(tasks.row(titles[0])).check();
        await tasks.box(tasks.row(titles[1])).check();
        await tasks.act('Delete');
        await expect(tasks.rows()).toHaveCount(0);
        await expect(tasks.noItems()).toBeVisible();
        await tasks.close();
        await tasks.expectCount(0);
        await managerPage.reload();
        await tasks.expectCount(0);
        await tasks.open();
        await expect(tasks.noItems()).toBeVisible();
        await expect(tasks.rows()).toHaveCount(0);
    });

    test('S3: unticking "Enable…" stops the task', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(180_000);
        const tag = makeTag('s3', testInfo);
        const managerA = `${tag}ma`;
        const managerB = `${tag}mb`;
        const author = `${tag}au`;
        const priorTitle = `Prior ${tag}`;
        const title = `Title ${tag}`;
        const journal = await seedJournal(ojsApi, tag, [
            {username: managerA, roles: ['manager']},
            {username: managerB, roles: ['manager']},
            {username: author, roles: ['author']},
        ]);
        // An earlier submission, so both Managers hold a row already (note s3).
        await ojsApi.createSubmission({tag, context: journal.path, submitter: author, title: priorTitle});

        // Manager A unticks "Enable…" under the needs-editor row: the email
        // box greys out; "Save" shows the success toast, gone by itself.
        const pageA = await (await asUser(managerA)).newPage();
        const profileA = await openNotificationsTab(pageA, journal.path);
        const pairA = profileA.notificationPair(NEEDS_EDITOR_SETTING);
        await pairA.allow.uncheck();
        await expect(pairA.email).toBeDisabled();
        await profileA.save();
        const toast = successToasts(pageA).filter({hasText: SAVED_MESSAGE});
        await expect(toast).toBeVisible();
        await expect(toast).toBeHidden({timeout: 15_000});

        // The Author submits through the wizard (the email is needed).
        const authorPage = await (await asUser(author)).newPage();
        await submitViaWizard(ojsApi, authorPage, journal.path, {tag, submitter: author, title});

        // Manager B's window gains the row and the bell "2".
        const pageB = await (await asUser(managerB)).newPage();
        const tasksB = new TasksPanel(pageB);
        await gotoEditorial(pageB, journal.path);
        await tasksB.expectCount(2);
        await tasksB.open();
        await expect(tasksB.row(title)).toHaveCount(1);
        await tasksB.expectUnread(tasksB.row(title));

        // Manager B's mailbox holds the email (the control that bounds A's
        // window read).
        await pkpMail.find({to: emailOf(managerB), subject: NEEDS_EDITOR_SUBJECT, contains: title});

        // Manager A's window gains no row for this title and the bell stays
        // at "1" (the earlier row stays; Rule 5a).
        const tasksA = new TasksPanel(pageA);
        await gotoEditorial(pageA, journal.path);
        await tasksA.expectCount(1);
        await tasksA.open();
        await expect(tasksA.row(priorTitle)).toHaveCount(1);
        await expect(tasksA.row(title)).toHaveCount(0);
        await tasksA.close();

        // Re-ticked: the email box is offered again, unticked; "Save".
        await profileA.goto('notifications');
        await expect(pairA.allow).not.toBeChecked();
        await pairA.allow.check();
        await expect(pairA.email).toBeEnabled();
        await expect(pairA.email).not.toBeChecked();
        await profileA.save();
        await expect(successToasts(pageA).filter({hasText: SAVED_MESSAGE})).toBeVisible();
    });

    test('S4: ticking "Do not send me an email…" keeps the task, stops the email', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(180_000);
        const tag = makeTag('s4', testInfo);
        const managerA = `${tag}ma`;
        const managerB = `${tag}mb`;
        const author = `${tag}au`;
        const title = `Title ${tag}`;
        const journal = await seedJournal(ojsApi, tag, [
            {username: managerA, roles: ['manager']},
            {username: managerB, roles: ['manager']},
            {username: author, roles: ['author']},
        ]);

        // Manager A ticks the email box under the needs-editor row and saves.
        const pageA = await (await asUser(managerA)).newPage();
        const profileA = await openNotificationsTab(pageA, journal.path);
        const pairA = profileA.notificationPair(NEEDS_EDITOR_SETTING);
        await expect(pairA.allow).toBeChecked();
        await pairA.email.check();
        await profileA.save();
        await expect(successToasts(pageA).filter({hasText: SAVED_MESSAGE})).toBeVisible();

        // The Author submits through the wizard.
        const authorPage = await (await asUser(author)).newPage();
        await submitViaWizard(ojsApi, authorPage, journal.path, {tag, submitter: author, title});

        // Both Managers get the task (Rule 5b).
        for (const [username, page] of [[managerA, pageA], [managerB, await (await asUser(managerB)).newPage()]]) {
            const tasks = new TasksPanel(page);
            await gotoEditorial(page, journal.path);
            await tasks.expectCount(1);
            await tasks.open();
            await expect(tasks.row(title), `${username}'s row`).toHaveCount(1);
            await tasks.expectUnread(tasks.row(title));
            await tasks.close();
        }

        // Manager B's mailbox holds the email; once it has arrived, Manager
        // A's holds none with that subject and title.
        const control = {to: emailOf(managerB), subject: NEEDS_EDITOR_SUBJECT, contains: title};
        await pkpMail.find(control);
        await pkpMail.expectNone({
            to: emailOf(managerA),
            subject: NEEDS_EDITOR_SUBJECT,
            contains: title,
            afterControl: control,
        });
    });

    test("S5: unsubscribing from an email's footer link", async ({browser, baseURL, asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s5', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        const managerName = 'Mona Manager';
        const firstName = `Discussion one ${tag}`;
        const secondName = `Discussion two ${tag}`;
        const firstMessage = `Opening message one ${tag}`;
        const secondMessage = `Opening message two ${tag}`;
        const journal = await seedJournal(ojsApi, tag, [
            {username: manager, givenName: 'Mona', familyName: 'Manager', roles: ['manager']},
            {username: author, givenName: 'Alba', familyName: 'Authorson', roles: ['author']},
        ]);
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: journal.path,
            submitter: author,
            title: `Title ${tag}`,
        });

        // The Manager opens a discussion with the Author on the Submission
        // stage's discussions panel.
        const managerPage = await (await asUser(manager)).newPage();
        managerPage.on('dialog', (dialog) => dialog.accept()); // the leave-page prompt after a save
        const workflow = new WorkflowPage(managerPage, journal.path);
        await workflow.gotoEditorial(submissionId);
        await addDiscussion(managerPage, {name: firstName, participantUsername: author, message: firstMessage});

        // The Author's email: subject the name, sent by the Manager, ending
        // with the discussion footer; the Manager holds a copy (Rule 7a).
        const authorMail = await discussionEmail(pkpMail, {to: emailOf(author), name: firstName});
        expect(authorMail.summary.From.Name).toBe(managerName);
        expect(authorMail.full.Text).toMatch(
            new RegExp(`Reply to this comment at #${submissionId} Authorson.*or unsubscribe.*from emails sent by ${journal.name}`, 's')
        );
        expect(authorMail.link, 'the footer "unsubscribe" link').toBeTruthy();
        await discussionEmail(pkpMail, {to: emailOf(manager), name: firstName});

        // Signed out, the link opens the Unsubscribe page naming the Author's
        // address, every box ticked; "Unsubscribe" answers the success page;
        // the link works again afterwards (Rules 8a–8d).
        const visitor = await anonContext(browser, baseURL);
        try {
            const visitorPage = await visitor.newPage();
            const unsubscribe = new UnsubscribePage(visitorPage);
            await unsubscribe.goto(authorMail.link);
            await expect(unsubscribe.sentence()).toHaveText(
                `Select the emails that you no longer wish to receive at ${emailOf(author)} from ${journal.name}.`
            );
            const boxCount = await unsubscribe.boxes().count();
            expect(boxCount).toBe(11);
            for (let i = 0; i < boxCount; i++) {
                await expect(unsubscribe.boxes().nth(i)).toBeChecked();
            }
            await expect(unsubscribe.profileLink()).toBeVisible();
            await expect(unsubscribe.button()).toBeVisible();
            await unsubscribe.unsubscribe();
            await expect(unsubscribe.successHeading).toBeVisible();
            await expect(unsubscribe.resultSentence()).toContainText(
                `The email address ${emailOf(author)} has been successfully unsubscribed.`
            );
            await unsubscribe.goto(authorMail.link);
            for (let i = 0; i < boxCount; i++) {
                await expect(unsubscribe.boxes().nth(i)).toBeChecked();
            }
        } finally {
            await visitor.close();
        }

        // The Author's tab: every email box ticked, every "Enable…" ticked.
        const authorPage = await (await asUser(author)).newPage();
        const authorProfile = await openNotificationsTab(authorPage, journal.path);
        await expectTabState(authorProfile, {emailTicked: true});

        // A second discussion: the Manager's copy arrives, the Author's
        // mailbox holds none with that name, and the Author's Tasks window
        // holds the new row (Rule 5b).
        await workflow.gotoEditorial(submissionId);
        await addDiscussion(managerPage, {name: secondName, participantUsername: author, message: secondMessage});
        await pkpMail.expectNone({
            to: emailOf(author),
            subject: secondName,
            afterControl: {to: emailOf(manager), subject: secondName},
        });
        const authorTasks = new TasksPanel(authorPage);
        await gotoMySubmissions(authorPage, journal.path);
        await authorTasks.open();
        const row = authorTasks.row(secondName);
        await expect(row).toHaveCount(1);
        await expect(authorTasks.sentence(row)).toHaveText(
            DISCUSSION_TASK({creatorName: managerName, name: secondName, message: secondMessage})
        );
        await authorTasks.expectUnread(row);
    });

    test('S6: the link acts on the addressee, not on whoever is signed in', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(180_000);
        const tag = makeTag('s6', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        const name = `Discussion ${tag}`;
        const journal = await seedJournal(ojsApi, tag, [
            {username: manager, givenName: 'Mona', familyName: 'Manager', roles: ['manager']},
            {username: author, givenName: 'Alba', familyName: 'Authorson', roles: ['author']},
        ]);
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: journal.path,
            submitter: author,
            title: `Title ${tag}`,
        });

        // Scenario 5's link: a discussion with the Author.
        const managerPage = await (await asUser(manager)).newPage();
        managerPage.on('dialog', (dialog) => dialog.accept());
        const workflow = new WorkflowPage(managerPage, journal.path);
        await workflow.gotoEditorial(submissionId);
        await addDiscussion(managerPage, {name, participantUsername: author, message: `Message ${tag}`});
        const {link} = await discussionEmail(pkpMail, {to: emailOf(author), name});
        expect(link, 'the footer "unsubscribe" link').toBeTruthy();

        // Signed in as the Manager, the page names the Author's address.
        const unsubscribe = new UnsubscribePage(managerPage);
        await unsubscribe.goto(link);
        await expect(unsubscribe.sentence()).toContainText(emailOf(author));
        await expect(unsubscribe.sentence()).not.toContainText(emailOf(manager));

        // Every box but "Discussion added." unticked, then "Unsubscribe".
        const boxCount = await unsubscribe.boxes().count();
        for (let i = 0; i < boxCount; i++) {
            await unsubscribe.boxes().nth(i).uncheck();
        }
        await unsubscribe.box(`email${DISCUSSION_SETTING.charAt(0).toUpperCase()}${DISCUSSION_SETTING.slice(1)}`).check();
        await unsubscribe.unsubscribe();
        await expect(unsubscribe.successHeading).toBeVisible();

        // The Author's tab: the email box ticked on "Discussion added." only,
        // every "Enable…" ticked; the Manager's own tab is unchanged.
        const authorPage = await (await asUser(author)).newPage();
        const authorProfile = await openNotificationsTab(authorPage, journal.path);
        const allow = authorProfile.allowBoxes();
        const email = authorProfile.emailBoxes();
        const rows = await allow.count();
        expect(rows).toBeGreaterThan(1);
        for (let i = 0; i < rows; i++) {
            await expect(allow.nth(i)).toBeChecked();
        }
        await expect(checkedEmailBoxes(authorProfile)).toHaveCount(1);
        await expect(authorProfile.notificationPair(DISCUSSION_SETTING).email).toBeChecked();
        const managerProfile = await openNotificationsTab(managerPage, journal.path);
        await expectTabState(managerProfile, {emailTicked: false});
    });

    test('S7: the rows, per application, and the site-level tab', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        // A scratch journal, so the site holds more than one journal (Rule 5d).
        const tag = makeTag('s7', testInfo);
        await seedJournal(ojsApi, tag, [{username: `${tag}mg`, roles: ['manager']}]);

        // The Journal Manager on the seeded journal: the four groups with
        // exactly the OJS rows, every "Enable…" ticked, every email box
        // unticked (Fields).
        const managerPage = await (await asUser('manager.maya')).newPage();
        const profile = await openNotificationsTab(managerPage, JOURNAL);
        await expect(profile.notificationsIntro()).toHaveText(NOTIFICATIONS_INTRO);
        expect(await profile.notificationTable()).toEqual(OJS_TAB);
        await expectTabState(profile, {emailTicked: false});

        // The Site Administrator's site-level tab: the same groups without
        // "Statistics report summary." (Rule 5d).
        const adminPage = await (await asUser('admin')).newPage();
        const siteProfile = new ProfilePage(adminPage, null);
        await siteProfile.goto('notifications');
        await expect(adminPage).toHaveURL(/\/index\/(en\/)?user\/profile/);
        expect(await siteProfile.notificationTable()).toEqual(SITE_TAB);
    });

    test('S8: registration presets the email choice', async ({browser, baseURL, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(180_000);
        const tag = makeTag('s8', testInfo);
        const journal = await seedJournal(ojsApi, tag, [{username: `${tag}mg`, roles: ['manager']}]);

        /** Register a visitor on the scratch journal; they land signed in. */
        const registerVisitor = async (username, {notify}) => {
            const context = await anonContext(browser, baseURL);
            const page = await context.newPage();
            const register = new RegisterPage(page, journal.path);
            await register.goto();
            await register.expectForm();
            await register.fillProfile({givenName: 'Vera', familyName: 'Visitor'});
            await register.fillLogin({email: emailOf(username), username, password: getPassword(username)});
            await register.privacyConsent.check();
            await expect(register.emailConsent).not.toBeChecked();
            if (notify) {
                await register.emailConsent.check();
            }
            await register.submitButton.click();
            await new RegistrationCompletePage(page).expectOpen();
            return {context, page};
        };

        // The first visitor leaves "Yes, I would like to be notified…"
        // unticked: every Public Announcements row has both boxes ticked;
        // the other rows are at their defaults (Rule 5e).
        const first = await registerVisitor(`${tag}r1`, {notify: false});
        try {
            const profile = await openNotificationsTab(first.page, journal.path);
            for (const setting of PUBLIC_SETTINGS) {
                const pair = profile.notificationPair(setting);
                await expect(pair.allow).toBeChecked();
                await expect(pair.email).toBeChecked();
            }
            await expect(checkedEmailBoxes(profile)).toHaveCount(PUBLIC_SETTINGS.length);
            const allow = profile.allowBoxes();
            for (let i = 0; i < (await allow.count()); i++) {
                await expect(allow.nth(i)).toBeChecked();
            }
        } finally {
            await first.context.close();
        }

        // The second visitor ticks the box: every box at its default.
        const second = await registerVisitor(`${tag}r2`, {notify: true});
        try {
            const profile = await openNotificationsTab(second.page, journal.path);
            await expectTabState(profile, {emailTicked: false});
        } finally {
            await second.context.close();
        }
    });
});
