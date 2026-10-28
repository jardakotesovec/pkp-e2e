// @ts-check
/**
 * @file playwright/tests/U05-notifications-center-and-email-preferences.spec.js
 *
 * Notifications center & email preferences — OPS suite, one test per
 * canonical scenario the spec runs on a preprint server (scenarios 1–8 and
 * 10, read with the spec's server vocabulary: "server" for "journal",
 * Preprint Server Manager for Journal Manager, Moderator for Section
 * Editor, and no reviewer role at all; "A new preprint has been submitted
 * to which a moderator needs to be assigned." for the "needs an editor"
 * row, "Production Tasks & Discussions" for the discussions panel, the
 * workflow's only stage being Production). Scenario 9 is OJS-only (a
 * preprint server has no issues and no issue row): the spec's absence
 * sentence is asserted where S7 reads the server's exact row list, and this
 * suite has no serial half. Scenario 11 is {OJS OMP}: its absence paragraph
 * says a preprint server has no reviewer role and no review stage, so
 * nothing raises the review-complete email there, while the tab lists the
 * reviewer row all the same (OPS1 ❓). The half of that paragraph a screen
 * of this spec shows, the row listed, is asserted where S7 reads the exact
 * row list and where S5 reads the Unsubscribe page's exact box list, each
 * with the rows around it as the control; the other half (no reviewer role,
 * no review stage) is an install fact no screen of this spec offers, owned
 * by the roles and workflow specs, so no further absence test is owed
 * (RUNBOOK multi-app rule 3, PRINCIPLES M4).
 * Spec: docs/specs/U05-notifications-center-and-email-preferences.md
 *
 * Not covered, by register ID: A1 🐞, A2 🐞, A3 🐞, A10 🐞, A15 🐞, A16 🐞,
 * OPS2 🐞, OPS3 🐞, A4 ❓, A5 ❓, A6 ❓, A7 ❓, A8 ❓, A9 ❓, A11 ❓, A12 ❓, A13 ❓,
 * OPS1 ❓.
 *
 * Isolation: every test seeds its own scratch preprint server with
 * throwaway accounts through the scenario endpoint (unique tags naming the
 * app, at most 14 characters, so no password reaches the Register page's
 * 32-character cap); `publicknowledge` and the roster are only read (S7).
 * Where the scenario needs the "needs an editor" EMAIL, the Author submits
 * through the wizard from a seeded draft (a seeded `submitted: true`
 * submission raises the task but sends no email, seed-facts; the wizard's
 * "For Readers" step is answered "This preprint has not been published
 * elsewhere."); where only the task is needed, the seed suffices. Mailpit
 * reads are scoped by the throwaway recipient (PRINCIPLES A8) and every
 * silence claim rides on a positive control. The bell's number is asserted
 * on a freshly loaded page or after the window closed, never on the page
 * that was open when the task was raised (Rule 2a). Every sign-in that a
 * scenario ends (S6's sign-out in another tab) or that a signed-out page
 * leads to (S5's "user profile") happens in the test's own fresh browser
 * context through the real Login form, never through the shared .auth
 * cache. S5 and S6 save a discussion from the workflow page, which on a
 * preprint server works only with the campaign's overlay class mounted
 * (docs/tracking/app-changes.md row 12; `npm run mount`, CI mounts it too);
 * leaving the workflow page afterwards raises the browser's leave-page
 * prompt, so both tests answer it. S7's admin reads (the site-level
 * window's rows, the site home's "Dashboard" number) are re-read together
 * when a parallel worker's seed lands between two reads, because `admin`
 * is a Preprint Server Manager of every scratch server. No hard-coded
 * waits: S3's and S5's "stays while the pointer rests on it" is bounded by
 * the toast's own disappearance once the pointer leaves, and S2's "newest
 * first" by the clock's next second, the condition the order depends on.
 * The narrow-window reads (S1, S7) set the test's own page below 992 px and
 * back (no seed key; note s1). S4's Moderator is assigned on screen with
 * "Assign" and "Message" left empty, never through `participants[]`, which
 * would leave the "needs an editor" rows in place (note s4).
 */
const {test, expect} = require('../support/fixtures.js');
const {ProfilePage, SAVED_MESSAGE} = require('../../../../shared/playwright/pages/ProfilePage.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {
    TasksPanel,
    UnsubscribePage,
    ReaderHeader,
    DISCUSSION_TASK,
    successToasts,
    toastCloseButton,
    expectStackedBelow,
    expectStaysWhileHovered,
    warningToasts,
    expectToastLook,
    narrowWindow,
    widenWindow,
} = require('../../../../shared/playwright/pages/NotificationsPages.js');
const {ParticipantsPanel, NOTICES} = require('../../../../shared/playwright/pages/StageParticipantsPages.js');
const {disableMotion} = require('../../../../shared/playwright/support/motion.js');
const appContext = require('../support/app.context.js');
const {wizardUrl, expectWizardOpen, completeAndSubmitDraft} = require('../pages/SubmissionWizardPages.js');
const {RegisterPage, RegistrationCompletePage} = require('../pages/RegistrationPages.js');
const {getPassword} = require('../../../../shared/playwright/data/users.js');
const {unordered} = require('../../../../shared/playwright/support/order.js');

const SERVER = 'publicknowledge';
const NEEDS_EDITOR_TASK = 'A new preprint has been submitted to which a moderator needs to be assigned.';
const NEEDS_EDITOR_SUBJECT = 'A new submission needs an editor to be assigned';
const NEEDS_EDITOR_SETTING = 'notificationEditorAssignmentRequired';
const DISCUSSION_SETTING = 'notificationNewQuery';
const DISCUSSIONS_PANEL = 'Production Tasks & Discussions';
const NEW_VERSION_OPENING = 'A new version of your submission';
const COUNTRY = 'Iceland';
/** The Moderator's role as the Participants panel and its "Assign" window spell it. */
const MODERATOR_ROLE = 'Moderator';
/** The workflow's one stage entry (Production) on a preprint server. */
const PRODUCTION = 'workflow_5';
const UNSUBSCRIBE_ERROR = (email) =>
    `There was an unexpected error and we could not unsubscribe the email address ${email}. You can unsubscribe from all email notifications in your user profile or contact us directly for help.`;
const NOTIFICATIONS_INTRO =
    'Select the system events that you wish to be notified about. Unchecking an item will prevent notifications of the event from showing up in the system and also from being emailed to you. Checked events will appear in the system and you have an extra option to receive or not the same notification by email.';

/**
 * The tab's groups and rows on a preprint server (Fields). The new-preprint
 * row is written here without OPS2's stray space; `tidy()` removes any
 * whitespace before punctuation from what the screen shows before the
 * comparison, so the row's words are the contract and its spacing is not.
 */
const OPS_TAB = [
    {group: 'Public Announcements', rows: ['A new announcement has been created.']},
    {
        group: 'Submission Events',
        rows: [
            'A new preprint, "Title", has been submitted.',
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
const SITE_TAB = OPS_TAB.map((entry) =>
    entry.group === 'Editors' ? {group: entry.group, rows: ['Weekly email of outstanding tasks']} : entry
);

/**
 * The Unsubscribe page's boxes on a preprint server, in the page's own
 * order (Fields: the OJS list without the two issue boxes, the announcement
 * box seventh), read through `tidy()` like the tab.
 */
const OPS_UNSUBSCRIBE_BOXES = [
    'A new preprint, "Title", has been submitted.',
    'A new version of your submission, "Title", was published.',
    NEEDS_EDITOR_TASK,
    'A reviewer has commented on "Title".',
    'Discussion added.',
    'Discussion activity.',
    'A new announcement has been created.',
    'Weekly email of outstanding tasks',
    'Statistics report summary.',
];

/** The Public Announcements rows' setting names on a server (Rule 5e, note s8): one row. */
const PUBLIC_SETTINGS = ['notificationNewAnnouncement'];

/**
 * Unique per-run tag: a single alphanumeric token naming the feature, the
 * app, the scenario and the worker, plus a random part; at most 14
 * characters (a throwaway username is the tag plus two letters, and its
 * password the username twice: under the Register page's 32-character cap
 * for the scenario that registers, S8, whose tag is 13 characters).
 */
function makeTag(scenario, testInfo) {
    return `u5ops${scenario}w${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 6)}`;
}

const emailOf = (username) => `${username}@mail.test`;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A row or box label as read, with whitespace before punctuation removed (OPS2 is not the contract). */
const tidy = (text) => text.replace(/\s+([,.])/g, '$1');

/** The tab as read, every row through `tidy()`. */
function tidyRows(table) {
    return table.map(({group, rows}) => ({group, rows: rows.map(tidy)}));
}

/**
 * A scratch preprint server with the named throwaway accounts. `admin` is
 * auto-enrolled as a Manager too (seed-facts) and gets every Manager task,
 * which touches nothing these tests assert.
 */
async function seedServer(opsApi, tag, users) {
    await opsApi.createContext({tag, users});
    return {path: tag, name: `Scratch context ${tag}`};
}

/**
 * The Author submits: from a seeded draft (title and abstract ride in from
 * the seed; the section has no moderators, so nobody is assigned), the
 * wizard is driven from Upload Files (a galley with its "Preprint Text"
 * component) through "For Readers" to the footer's "Submit" and the
 * dialog's "Submit". The wizard's own request sends the "needs an editor"
 * email.
 */
async function submitViaWizard(opsApi, authorPage, serverPath, {tag, submitter, title}) {
    const {submissionId} = await opsApi.createSubmission({
        tag,
        context: serverPath,
        submitter,
        title,
        submitted: false,
        participants: [],
    });
    await authorPage.goto(wizardUrl(serverPath, submissionId));
    await expectWizardOpen(authorPage);
    await completeAndSubmitDraft(authorPage);
    return submissionId;
}

/**
 * Where a task's press lands, as compared between two presses (Rule 2c):
 * the path and the two query keys either landing carries
 * (`workflowSubmissionId` on the workflow, `message` on the denied page);
 * any other query part is left out (note s1). Which page it is stays
 * unasserted (OPS3).
 */
function landingOf(address) {
    const url = new URL(address);
    return {
        path: url.pathname,
        workflowSubmissionId: url.searchParams.get('workflowSubmissionId'),
        message: url.searchParams.get('message'),
    };
}

/** The editorial dashboard of a server (any editorial page carries the bell). */
async function gotoEditorial(page, serverPath) {
    await page.goto(`/index.php/${serverPath}/dashboard/editorial`);
    await expect(new TasksPanel(page).bell()).toBeVisible({timeout: 30_000});
}

/** The Author's editorial page (My Submissions carries the bell too). */
async function gotoMySubmissions(page, serverPath) {
    await page.goto(`/index.php/${serverPath}/dashboard/mySubmissions`);
    await expect(new TasksPanel(page).bell()).toBeVisible({timeout: 30_000});
}

/** Open the Notifications tab for the signed-in account on a server. */
async function openNotificationsTab(page, serverPath) {
    const profile = new ProfilePage(page, serverPath);
    await profile.goto('notifications');
    return profile;
}

/** The server's home page as the signed-in account (the reader-side header). */
async function gotoServerHome(page, serverPath) {
    await page.goto(`/index.php/${serverPath}/index`);
    const header = new ReaderHeader(page);
    await expect(header.toggle).toBeVisible({timeout: 30_000});
    return header;
}

/** The site's own home page as the signed-in account (the reader-side header). */
async function gotoSiteHome(page) {
    await page.goto('/index.php/index/index');
    const header = new ReaderHeader(page);
    await expect(header.toggle).toBeVisible({timeout: 30_000});
    return header;
}

/**
 * The entries under the name, read in the DOM before the name is pressed
 * (hidden until then; `textContent`), so the read leaves the page as it is.
 */
async function hiddenMenuEntries(header) {
    const texts = await header.menu.locator('a').allTextContents();
    return texts.map((text) => text.replace(/\s+/g, ' ').trim());
}

/**
 * Read two things that must agree and re-read both when they do not: a
 * parallel worker's seed may raise a task for `admin` between the two
 * reads (S7). Fails with the last pair after three tries.
 */
async function expectAgreeing(readFirst, readSecond, {label}) {
    let first;
    let second;
    for (let attempt = 0; attempt < 3; attempt++) {
        first = await readFirst();
        second = await readSecond();
        if (JSON.stringify(first) === JSON.stringify(second)) {
            return first;
        }
    }
    expect(second, label).toEqual(first);
    return first;
}

/**
 * A number read between two reads of a moving count lies within them:
 * parallel tests raise and clear `admin`'s tasks several times a second
 * (S7), so the "Dashboard" entry is read between two reads of the bell and
 * must fall in their range (equal to both when nothing moved). Three tries
 * (fix list B, flake-s26: the pair of reads alone disagreed on all three
 * tries in 2 of 5 runs at eight workers).
 */
async function expectBetweenReads(readCount, readOther, {label}) {
    let range = [];
    let other;
    for (let attempt = 0; attempt < 3; attempt++) {
        const before = await readCount();
        other = await readOther();
        const after = await readCount();
        range = [Math.min(before, after), Math.max(before, after)];
        if (other >= range[0] && other <= range[1]) {
            return other;
        }
    }
    expect(other, `${label} (between ${range[0]} and ${range[1]})`).toBeGreaterThanOrEqual(range[0]);
    expect(other, `${label} (between ${range[0]} and ${range[1]})`).toBeLessThanOrEqual(range[1]);
    return other;
}

/**
 * The Manager opens a discussion with the Author (scenario 5's labels):
 * "Add" in the "Production Tasks & Discussions" panel, a "Name", the
 * Author's box under "Participants" (the Manager's own box arrives ticked;
 * the form offers no email choice), a message, "Save". Waits for the save
 * (`POST …/submissions/{id}/tasks`).
 */
async function addDiscussion(managerPage, {name, participantUsername, ownUsername, message}) {
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
    await expect(participantBox).not.toBeChecked();
    // The Manager's own box arrives ticked, and no box or choice on the
    // form is about email (the participant boxes are the control).
    await expect(modal.getByRole('checkbox', {name: new RegExp(ownUsername)})).toBeChecked();
    await expect(modal.getByRole('checkbox', {name: /e-?mail/i})).toHaveCount(0);
    await expect(modal.getByRole('radio', {name: /e-?mail/i})).toHaveCount(0);
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
    const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
    await disableMotion(context);
    return context;
}

/** Sign in through the server's own Login form in the test's own context. */
async function signInAtServer(page, serverPath, username) {
    const login = new LoginPage(page);
    await login.gotoContext(serverPath);
    await login.expectForm();
    await login.signIn(username, getPassword(username));
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
    test('S1: a submission raises a task, and the bell counts it', {tag: '@smoke'}, async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        const title = `Title ${tag}`;
        const server = await seedServer(opsApi, tag, [
            {username: manager, givenName: 'Mona', familyName: 'Manager', roles: ['manager']},
            {username: author, givenName: 'Alba', familyName: 'Authorson', roles: ['author']},
        ]);

        // The Manager's page is open before the submission: no number.
        const managerPage = await (await asUser(manager)).newPage();
        const tasks = new TasksPanel(managerPage);
        await gotoEditorial(managerPage, server.path);
        await tasks.expectCount(0);

        // The Author submits through the wizard.
        const authorPage = await (await asUser(author)).newPage();
        await submitViaWizard(opsApi, authorPage, server.path, {tag, submitter: author, title});

        // Bounded by the Manager's own email, the page open before the
        // submission still shows no number; a reload shows "1" (Rule 2a).
        await pkpMail.find({to: emailOf(manager), subject: NEEDS_EDITOR_SUBJECT, contains: title});
        await tasks.expectCount(0);
        await managerPage.reload();
        await tasks.expectCount(1);

        // The reader-side count: on the server's home page the name reads
        // "{name} 1"; under it "Dashboard" and "View Profile" and no list
        // of tasks (Rule 4).
        let header = await gotoServerHome(managerPage, server.path);
        await header.expectCount(manager, 1);
        await header.open();
        const entries = await header.entryTexts();
        expect(entries.map((entry) => entry.replace(/\s+\d+$/, ''))).toEqual(['Dashboard', 'View Profile', 'Logout']);
        expect(entries.some((entry) => entry.includes(NEEDS_EDITOR_TASK) || entry.includes(title))).toBe(false);
        await expect(header.wrapper).not.toContainText(title);

        // The narrow window: below 992 px, "Open Menu" lists the name bare,
        // with "Dashboard", "View Profile" and "Logout" under it, and the
        // number follows "Dashboard": "Dashboard 1" (Rule 4b). The wide
        // read above is the control on the same page; the window is
        // widened back before the next page.
        const wideSize = await narrowWindow(managerPage);
        try {
            const narrow = new ReaderHeader(managerPage);
            await narrow.gotoNarrowAndOpenMenu(`/index.php/${server.path}/index`);
            await narrow.expectNarrowBareName(manager);
            expect(await narrow.narrowEntryTexts()).toEqual(['Dashboard 1', 'View Profile', 'Logout']);
            await narrow.expectNarrowDashboardCount(1);
        } finally {
            await widenWindow(managerPage, wideSize);
        }

        // The window: one bold row with the moderator sentence and the
        // title; the bell greyed out with no number while it is open (Rules
        // 2a, 2b).
        await gotoEditorial(managerPage, server.path);
        await tasks.expectCount(1);
        await tasks.open();
        await expect(tasks.rows()).toHaveCount(1);
        const row = tasks.rows().first();
        await tasks.expectUnread(row);
        await expect(tasks.sentence(row)).toHaveText(NEEDS_EDITOR_TASK);
        await expect(tasks.title(row)).toHaveText(title);
        await expect(tasks.bell()).toBeDisabled();
        await expect(tasks.bell()).toHaveText(/^\s*Tasks\s*$/);

        // The blank part of the row (the task cell's corner, outside the
        // row's one link): nothing happens; the window stays on the same
        // address, the row is still bold, its box unticked (Rule 2c).
        await tasks.pressBlankPart(row);
        await expect(tasks.rows()).toHaveCount(1);
        await tasks.expectUnread(row);
        await expect(tasks.box(row)).not.toBeChecked();

        // Pressing the text leaves the window (Rule 2c). Where a preprint
        // server lands is OPS3's 🐞 and is not asserted; that the browser
        // leaves, and that the task is read either way, is the contract.
        const before = managerPage.url();
        await tasks.openTask(row);
        await managerPage.waitForURL((url) => url.href !== before, {waitUntil: 'commit', timeout: 30_000});
        const landing = landingOf(managerPage.url());

        // The blank space beside the sentence: back on an editorial page,
        // the bell, then a press right of the sentence's end on its line:
        // the same page opens as after the press on the sentence (Rule 2c).
        await gotoEditorial(managerPage, server.path);
        await tasks.open();
        const editorialAddress = managerPage.url();
        await tasks.pressBesideSentence(tasks.row(title));
        await managerPage.waitForURL((url) => url.href !== editorialAddress, {waitUntil: 'commit', timeout: 30_000});
        expect(landingOf(managerPage.url())).toEqual(landing);

        // Back on an editorial page: no number; the row is read now; the
        // server's home page reads "{name} 0" (Rule 4, Side effects).
        await gotoEditorial(managerPage, server.path);
        await tasks.expectCount(0);
        await tasks.open();
        await expect(tasks.rows()).toHaveCount(1);
        await tasks.expectRead(tasks.row(title));
        await tasks.close();
        header = await gotoServerHome(managerPage, server.path);
        await header.expectCount(manager, 0);
    });

    test('S2: Mark New, Mark Read, Delete', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const manager = `${tag}mg`;
        const otherManager = `${tag}m2`;
        const author = `${tag}au`;
        const server = await seedServer(opsApi, tag, [
            {username: manager, roles: ['manager']},
            {username: otherManager, roles: ['manager']},
            {username: author, roles: ['author']},
        ]);
        // Two submissions, the second later (a seeded submission raises the
        // same task the wizard does; no email is needed here). The window
        // orders rows by the task's creation time at one-second
        // granularity (note s2; T-omp-2), so two seeds inside the same
        // second tie and come in either order: the second seed waits for
        // the clock's next second, the condition the order depends on,
        // never a guessed delay.
        const titles = [`First ${tag}`, `Second ${tag}`];
        await opsApi.createSubmission({tag, context: server.path, submitter: author, title: titles[0]});
        const firstSeededAt = Date.now(); // the task is stamped at the end of the request
        while (Math.floor(Date.now() / 1000) <= Math.floor(firstSeededAt / 1000)) {
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await opsApi.createSubmission({tag, context: server.path, submitter: author, title: titles[1]});

        const managerPage = await (await asUser(manager)).newPage();
        const tasks = new TasksPanel(managerPage);
        await gotoEditorial(managerPage, server.path);
        await tasks.expectCount(2);

        // Newest first: the first row carries the later submission's title,
        // the second row the earlier one's (Rule 2b); both unread.
        await tasks.open();
        await expect(tasks.rows()).toHaveCount(2);
        await expect(tasks.title(tasks.rows().nth(0))).toHaveText(titles[1]);
        await expect(tasks.title(tasks.rows().nth(1))).toHaveText(titles[0]);
        await tasks.expectUnread(tasks.row(titles[0]));
        await tasks.expectUnread(tasks.row(titles[1]));

        // The "Select" column: each row starts with a box (the positive
        // control), and the column's header holds none, so no box ticks
        // every row at once (Fields, "The Tasks panel").
        await tasks.expectSelectHeaderWithoutBox();

        // "Mark Read" with nothing ticked changes nothing.
        await tasks.act('Mark Read', {expectRequest: false});
        await expect(tasks.rows()).toHaveCount(2);
        await tasks.expectUnread(tasks.row(titles[0]));
        await tasks.expectUnread(tasks.row(titles[1]));
        await expect(managerPage.locator('.pkpNotification')).toHaveCount(0);

        // Tick the first row, "Mark Read": regular type, box unticked; the
        // bell shows "1" once the window is closed (Rule 3).
        const firstTitle = titles[1];
        await tasks.box(tasks.row(firstTitle)).check();
        await tasks.act('Mark Read');
        await tasks.expectRead(tasks.row(firstTitle));
        await expect(tasks.box(tasks.row(firstTitle))).not.toBeChecked();
        await tasks.close();
        await tasks.expectCount(1);

        // "Mark New" on the same row: bold again.
        await tasks.open();
        await tasks.box(tasks.row(firstTitle)).check();
        await tasks.act('Mark New');
        await tasks.expectUnread(tasks.row(firstTitle));

        // The Escape key: the window closes, and the bell shows "2" (Fields,
        // "The Tasks panel").
        await tasks.pressEscape();
        await tasks.expectCount(2);

        // "Delete" on both: gone at once, "No Items"; "Close": no number; a
        // reload shows the same.
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

        // Control: the second Preprint Server Manager's own window still
        // lists both rows for the same submissions (Actors & permissions).
        const otherPage = await (await asUser(otherManager)).newPage();
        const otherTasks = new TasksPanel(otherPage);
        await gotoEditorial(otherPage, server.path);
        await otherTasks.expectCount(2);
        await otherTasks.open();
        await expect(otherTasks.rows()).toHaveCount(2);
        await expect(otherTasks.row(titles[0])).toHaveCount(1);
        await expect(otherTasks.row(titles[1])).toHaveCount(1);
    });

    test('S3: unticking "Enable…" stops the task, not the email', async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(180_000);
        const tag = makeTag('s3', testInfo);
        const managerA = `${tag}ma`;
        const managerB = `${tag}mb`;
        const author = `${tag}au`;
        const priorTitle = `Prior ${tag}`;
        const title = `Title ${tag}`;
        const secondTitle = `Later ${tag}`;
        const server = await seedServer(opsApi, tag, [
            {username: managerA, roles: ['manager']},
            {username: managerB, roles: ['manager']},
            {username: author, roles: ['author']},
        ]);
        // An earlier submission, so both Managers hold a row already (note s3).
        await opsApi.createSubmission({tag, context: server.path, submitter: author, title: priorTitle});

        // Manager A unticks "Enable…" under the needs-editor row: the email
        // box greys out; "Save" shows the success toast at the top right.
        const pageA = await (await asUser(managerA)).newPage();
        const profileA = await openNotificationsTab(pageA, server.path);
        const pairA = profileA.notificationPair(NEEDS_EDITOR_SETTING);
        await pairA.allow.uncheck();
        await expect(pairA.email).toBeDisabled();
        await profileA.save();
        const toasts = successToasts(pageA).filter({hasText: SAVED_MESSAGE});
        await expect(toasts).toHaveCount(1);
        await expect(toasts.first()).toBeVisible();

        // The toast (Rule 9): "Save" again at once stacks a second toast
        // under the first; the first toast's "×" removes it; the other stays
        // while the pointer rests on it, past its own lifetime, and
        // disappears by itself once the pointer leaves.
        await profileA.save();
        await expect(toasts).toHaveCount(2);
        await expectStackedBelow(toasts.nth(0), toasts.nth(1));
        await toastCloseButton(toasts.nth(0)).click();
        await expect(toasts).toHaveCount(1);
        await expectStaysWhileHovered(pageA, toasts.first());
        await expect(toasts).toHaveCount(0);

        // The Author submits through the wizard (the email is needed).
        const authorPage = await (await asUser(author)).newPage();
        await submitViaWizard(opsApi, authorPage, server.path, {tag, submitter: author, title});

        // Manager B's window gains the row and the bell "2".
        const pageB = await (await asUser(managerB)).newPage();
        const tasksB = new TasksPanel(pageB);
        await gotoEditorial(pageB, server.path);
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
        await gotoEditorial(pageA, server.path);
        await tasksA.expectCount(1);
        await tasksA.open();
        await expect(tasksA.row(priorTitle)).toHaveCount(1);
        await expect(tasksA.row(title)).toHaveCount(0);
        await tasksA.close();

        // Re-ticked: the email box is offered again, unticked; "Save": the
        // window still holds no row for that submission (Rule 5a).
        await profileA.goto('notifications');
        await expect(pairA.allow).not.toBeChecked();
        await pairA.allow.check();
        await expect(pairA.email).toBeEnabled();
        await expect(pairA.email).not.toBeChecked();
        await profileA.save();
        await expect(successToasts(pageA).filter({hasText: SAVED_MESSAGE})).toBeVisible();
        await gotoEditorial(pageA, server.path);
        await tasksA.expectCount(1);
        await tasksA.open();
        await expect(tasksA.row(priorTitle)).toHaveCount(1);
        await expect(tasksA.row(title)).toHaveCount(0);
        await tasksA.close();

        // Control: the Author submits again (the seed raises the row; only
        // the row is read): Manager A's window gains the row for this second
        // submission and the bell reads "2"; re-ticking brings back future
        // events only (Rule 5a).
        await opsApi.createSubmission({tag, context: server.path, submitter: author, title: secondTitle});
        await gotoEditorial(pageA, server.path);
        await tasksA.expectCount(2);
        await tasksA.open();
        await expect(tasksA.row(secondTitle)).toHaveCount(1);
        await tasksA.expectUnread(tasksA.row(secondTitle));
        await expect(tasksA.row(title)).toHaveCount(0);
    });

    test('S4: ticking "Do not send me an email…" keeps the task, stops the email', async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        const managerA = `${tag}ma`;
        const managerB = `${tag}mb`;
        const moderator = `${tag}se`;
        const author = `${tag}au`;
        const moderatorPerson = {givenName: 'Sam', familyName: 'Moderator'};
        const title = `Title ${tag}`;
        const secondTitle = `Again ${tag}`;
        // The Section Editor of the given is a Moderator on a preprint
        // server (`sectionEditor` in users[], scenarios.md), assigned to no
        // submission.
        const server = await seedServer(opsApi, tag, [
            {username: managerA, roles: ['manager']},
            {username: managerB, roles: ['manager']},
            {username: moderator, ...moderatorPerson, roles: ['sectionEditor']},
            {username: author, roles: ['author']},
        ]);

        // Manager A ticks the email box under the needs-editor row and saves.
        const pageA = await (await asUser(managerA)).newPage();
        const profileA = await openNotificationsTab(pageA, server.path);
        const pairA = profileA.notificationPair(NEEDS_EDITOR_SETTING);
        await expect(pairA.allow).toBeChecked();
        await pairA.email.check();
        await profileA.save();
        await expect(successToasts(pageA).filter({hasText: SAVED_MESSAGE})).toBeVisible();

        // The Author submits through the wizard.
        const authorPage = await (await asUser(author)).newPage();
        const submissionId = await submitViaWizard(opsApi, authorPage, server.path, {tag, submitter: author, title});

        // Both Managers get the task (Rule 5b).
        const pageB = await (await asUser(managerB)).newPage();
        pageB.on('dialog', (dialog) => dialog.accept()); // the leave-page prompt after "Assign"
        for (const [username, page] of [[managerA, pageA], [managerB, pageB]]) {
            const tasks = new TasksPanel(page);
            await gotoEditorial(page, server.path);
            await tasks.expectCount(1);
            await tasks.open();
            await expect(tasks.row(title), `${username}'s row`).toHaveCount(1);
            await tasks.expectUnread(tasks.row(title));
            await tasks.close();
        }

        // Manager A's mailbox: once Manager B's email for this submission
        // has arrived (the Control's email), it holds none with that subject
        // and title.
        const control = {to: emailOf(managerB), subject: NEEDS_EDITOR_SUBJECT, contains: title};
        await pkpMail.find(control);
        await pkpMail.expectNone({
            to: emailOf(managerA),
            subject: NEEDS_EDITOR_SUBJECT,
            contains: title,
            afterControl: control,
        });

        // Manager B assigns the Moderator with "Assign" on the submission's
        // Participants panel ("Message" left empty, so no discussion and no
        // discussion task go with it); the panel lists the Moderator (the
        // assignment took). Neither Manager's window holds the row for this
        // title any more, and the Moderator's window holds none for it
        // either (Rules 1, 6).
        const panel = new ParticipantsPanel(pageB, server.path, {appContext});
        await panel.goto(submissionId, {menuKey: PRODUCTION});
        const assign = await panel.openAssign();
        await assign.chooseRole(MODERATOR_ROLE);
        await assign.search();
        await assign.choosePerson(`${moderatorPerson.givenName} ${moderatorPerson.familyName}`);
        expect((await assign.messageText()).trim()).toBe('');
        await assign.ok();
        await expect
            .poll(async () => (await panel.rowLines()).find((lines) => lines[1] === `${moderatorPerson.givenName} ${moderatorPerson.familyName}`), {timeout: 30_000})
            .toEqual(ParticipantsPanel.lines(moderatorPerson, MODERATOR_ROLE));
        for (const [username, page] of [[managerA, pageA], [managerB, pageB]]) {
            const tasks = new TasksPanel(page);
            await gotoEditorial(page, server.path);
            await tasks.open();
            await expect(tasks.grid()).toBeVisible();
            await expect(tasks.row(title), `${username}'s row after the assignment`).toHaveCount(0);
            await tasks.close();
        }
        const moderatorPage = await (await asUser(moderator)).newPage();
        const moderatorTasks = new TasksPanel(moderatorPage);
        await gotoEditorial(moderatorPage, server.path);
        await moderatorTasks.open();
        await expect(moderatorTasks.grid()).toBeVisible();
        await expect(moderatorTasks.rows().or(moderatorTasks.noItems()).first()).toBeVisible();
        await expect(moderatorTasks.row(title)).toHaveCount(0);
        await moderatorTasks.close();

        // Manager A unticks "Enable…" under the same row: the email box
        // greys out and keeps its tick; "Save" (Rule 5c). No mailbox is read
        // while "Enable…" is unticked (the email arrives regardless, A10).
        await profileA.goto('notifications');
        await expect(pairA.allow).toBeChecked();
        await expect(pairA.email).toBeChecked();
        await pairA.allow.uncheck();
        await expect(pairA.email).toBeDisabled();
        await expect(pairA.email).toBeChecked();
        await profileA.save();
        await expect(successToasts(pageA).filter({hasText: SAVED_MESSAGE}).first()).toBeVisible();

        // The tab's next load: "Enable…" unticked, the email box greyed out
        // and unticked (Rule 5c).
        await profileA.goto('notifications');
        await expect(pairA.allow).not.toBeChecked();
        await expect(pairA.email).toBeDisabled();
        await expect(pairA.email).not.toBeChecked();

        // Manager A ticks "Enable…" back: the email box is offered again,
        // unticked; "Save" (Rule 5c).
        await pairA.allow.check();
        await expect(pairA.email).toBeEnabled();
        await expect(pairA.email).not.toBeChecked();
        await profileA.save();
        await expect(successToasts(pageA).filter({hasText: SAVED_MESSAGE}).first()).toBeVisible();

        // The Author submits again: Manager A's mailbox holds the email
        // with the second submission's title; the event's emails come again
        // (Rule 5c).
        await submitViaWizard(opsApi, authorPage, server.path, {tag, submitter: author, title: secondTitle});
        await pkpMail.find({to: emailOf(managerA), subject: NEEDS_EDITOR_SUBJECT, contains: secondTitle});

        // Control: Manager B's mailbox holds the email with the first
        // submission's title: the box stopped Manager A's email alone.
        await pkpMail.find(control);
    });

    test("S5: unsubscribing from an email's footer link", async ({browser, baseURL, asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s5', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        const managerName = 'Mona Manager';
        const firstName = `Footer check ${tag}`;
        const secondName = `Second check ${tag}`;
        const firstMessage = `Please read the footer. ${tag}`;
        const secondMessage = `Still reading? ${tag}`;
        const server = await seedServer(opsApi, tag, [
            {username: manager, givenName: 'Mona', familyName: 'Manager', roles: ['manager']},
            {username: author, givenName: 'Alba', familyName: 'Authorson', roles: ['author']},
        ]);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: server.path,
            submitter: author,
            title: `Title ${tag}`,
        });

        // The Manager opens a discussion with the Author on the Production
        // stage's discussions panel (the workflow opens on that stage, the
        // server's only one; the Manager's own box arrives ticked; the form
        // offers no email choice).
        const managerPage = await (await asUser(manager)).newPage();
        managerPage.on('dialog', (dialog) => dialog.accept()); // the leave-page prompt after a save
        const workflow = new WorkflowPage(managerPage, server.path);
        await workflow.gotoEditorial(submissionId);
        await addDiscussion(managerPage, {name: firstName, participantUsername: author, ownUsername: manager, message: firstMessage});

        // The Author's email: subject the name, the Manager's name in its
        // From line, ending with the discussion footer whose "unsubscribe"
        // and server name are links; the plain-text version shows each
        // link's address in parentheses after its words; the Manager holds
        // a copy (Rule 7a).
        const authorMail = await discussionEmail(pkpMail, {to: emailOf(author), name: firstName});
        expect(authorMail.summary.From.Name).toBe(managerName);
        expect(authorMail.full.Text).toMatch(
            new RegExp(`Reply to this comment at #${submissionId} Authorson.*or unsubscribe.*from emails sent by ${escapeRegExp(server.name)}`, 's')
        );
        expect(authorMail.full.Text).toMatch(/unsubscribe \(\s*https?:\/\/[^)]*\/notification\/unsubscribe\?[^)]*\)/);
        expect(authorMail.full.Text).toMatch(
            new RegExp(`${escapeRegExp(server.name)} \\(\\s*https?://[^)]*/${server.path}[^)]*\\)`)
        );
        expect(authorMail.link, 'the footer "unsubscribe" link').toBeTruthy();
        expect(authorMail.link).toMatch(new RegExp(`/${server.path}/notification/unsubscribe\\?validate=[^&]+&id=\\d+$`));
        const serverLink = pkpMail.extractLink(authorMail.full.HTML, server.name);
        expect(serverLink, 'the server name is a link').toBeTruthy();
        expect(serverLink).toMatch(new RegExp(`/${server.path}(/|$)`));
        await discussionEmail(pkpMail, {to: emailOf(manager), name: firstName});
        expect(await pkpMail.count({to: emailOf(author)})).toBe(1);

        // Signed out, the link opens the Unsubscribe page naming the Author's
        // address, the server's nine boxes in the page's order, every one
        // ticked; "Unsubscribe" answers the success page; the link works
        // again afterwards (Rules 8a–8d); no email confirms it.
        const visitor = await anonContext(browser, baseURL);
        try {
            const visitorPage = await visitor.newPage();
            const unsubscribe = new UnsubscribePage(visitorPage);
            await unsubscribe.goto(authorMail.link);
            await expect(unsubscribe.sentence()).toHaveText(
                `Select the emails that you no longer wish to receive at ${emailOf(author)} from ${server.name}.`
            );
            expect((await unsubscribe.boxLabels()).map(tidy)).toEqual(OPS_UNSUBSCRIBE_BOXES);
            const boxCount = await unsubscribe.boxes().count();
            expect(boxCount).toBe(OPS_UNSUBSCRIBE_BOXES.length);
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
            // No email confirms it: the Author's mailbox still holds the
            // discussion's email alone (the server answered the unsubscribe
            // request; its mail leaves inside the request).
            expect(await pkpMail.count({to: emailOf(author)})).toBe(1);

            // Three broken links: each opens the bare "404 Not Found" page,
            // that text alone, without the server's header (Rule 8a).
            const broken = UnsubscribePage.brokenLinks(authorMail.link);
            await unsubscribe.expectNotFound(broken.codeOnly);
            await unsubscribe.expectNotFound(broken.idOnly);
            await unsubscribe.expectNotFound(broken.unknownId);

            // "user profile", signed out: the intact link once more, then the
            // link: the Login page; signed in as the Author, the server's
            // Profile page opens on "Identity" (Rule 8e).
            await unsubscribe.goto(authorMail.link);
            await unsubscribe.pressProfileLink();
            const login = new LoginPage(visitorPage);
            await login.expectForm();
            await expect(visitorPage).toHaveURL(/\/login/);
            await login.signIn(author, getPassword(author));
            const authorProfile = new ProfilePage(visitorPage, server.path);
            await authorProfile.expectOpen('identity');
            await authorProfile.expectSelectedTab('identity');
            await expect(visitorPage).toHaveURL(new RegExp(`/${server.path}/user/profile`));

            // The Author's tab: every email box ticked, every "Enable…"
            // ticked (Rule 8c); the tab has no row the Unsubscribe page did
            // not list a box for.
            await authorProfile.open('notifications');
            await authorProfile.expectSelectedTab('notifications');
            await expectTabState(authorProfile, {emailTicked: true});
            const tabRows = (await authorProfile.notificationSentences()).map(tidy);
            expect(tabRows.length).toBeGreaterThan(0);
            expect(tabRows.filter((row) => !OPS_UNSUBSCRIBE_BOXES.includes(row))).toEqual([]);
            expect([...tabRows].sort()).toEqual([...OPS_UNSUBSCRIBE_BOXES].sort());

            // A second discussion: the Manager's copy arrives, the Author's
            // mailbox holds none with that name (the first one is still
            // there), and the Author's Tasks window holds the new row: the
            // email stopped, the task kept (Rule 8c).
            await workflow.gotoEditorial(submissionId);
            await addDiscussion(managerPage, {name: secondName, participantUsername: author, ownUsername: manager, message: secondMessage});

            // A toast over the "Notify" panel: on the same workflow page's
            // Participants panel (landed afresh after the discussion's
            // window, StageParticipantsPages), the Author's "More Actions" ›
            // "Notify", "Message" left empty, "Notify": a pink-edged toast at
            // the top right with the refusal (Rule 9a); it stays while the
            // pointer rests on it and goes by itself after the pointer
            // leaves, the "Notify" side panel open throughout (Rule 9b).
            const panel = new ParticipantsPanel(managerPage, server.path, {appContext});
            await panel.reland();
            const notifyWindow = await panel.openNotify('Alba Authorson');
            expect((await notifyWindow.messageText()).trim()).toBe('');
            const refusal = warningToasts(managerPage).filter({hasText: NOTICES.notifyRefused});
            await notifyWindow.notifyButton().click();
            await expect(refusal).toHaveCount(1);
            await expect(refusal).toBeVisible();
            await expectToastLook(refusal, 'warning');
            const toastBox = await refusal.boundingBox();
            const viewport = managerPage.viewportSize();
            expect(toastBox, 'the toast has a box').toBeTruthy();
            expect(toastBox.x + toastBox.width, 'the toast sits at the right').toBeGreaterThan(viewport.width - 40);
            expect(toastBox.x, 'the toast sits at the right').toBeGreaterThan(viewport.width / 2);
            expect(toastBox.y, 'the toast sits at the top').toBeLessThan(150);
            await expectStaysWhileHovered(managerPage, refusal, {keepsOpen: notifyWindow.notifyButton()});
            await expect(notifyWindow.notifyButton()).toBeVisible();

            await pkpMail.expectNone({
                to: emailOf(author),
                subject: secondName,
                afterControl: {to: emailOf(manager), subject: secondName},
            });
            expect(await pkpMail.count({to: emailOf(author), subject: firstName})).toBe(1);
            const authorTasks = new TasksPanel(visitorPage);
            await gotoMySubmissions(visitorPage, server.path);
            await authorTasks.open();
            const row = authorTasks.row(secondName);
            await expect(row).toHaveCount(1);
            await expect(authorTasks.sentence(row)).toHaveText(
                DISCUSSION_TASK({creatorName: managerName, name: secondName, message: secondMessage})
            );
            await authorTasks.expectUnread(row);
        } finally {
            await visitor.close();
        }
    });

    test('S6: the link acts on the addressee, not on whoever is signed in', async ({browser, baseURL, asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s6', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        const name = `Discussion ${tag}`;
        // Accounts of its own (not S5's), the Author's tab at its defaults;
        // the submission lists a second author after the Author (a
        // contributors[] entry, scenarios.md), so the Author stays first.
        const server = await seedServer(opsApi, tag, [
            {username: manager, givenName: 'Mona', familyName: 'Manager', roles: ['manager']},
            {username: author, givenName: 'Alba', familyName: 'Authorson', roles: ['author']},
        ]);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: server.path,
            submitter: author,
            title: `Title ${tag}`,
            contributors: [{givenName: 'Cora', familyName: 'Coauthor', email: `${tag}co@mail.test`}],
        });

        // The Manager's session is the test's own (it is signed out and in
        // again below), through the server's Login form.
        const managerContext = await anonContext(browser, baseURL);
        try {
            const managerPage = await managerContext.newPage();
            managerPage.on('dialog', (dialog) => dialog.accept());
            await signInAtServer(managerPage, server.path, manager);

            // A discussion with the Author, as in scenario 5's first step.
            const workflow = new WorkflowPage(managerPage, server.path);
            await workflow.gotoEditorial(submissionId);
            await addDiscussion(managerPage, {name, participantUsername: author, ownUsername: manager, message: `Message ${tag}`});
            const {full, link} = await discussionEmail(pkpMail, {to: emailOf(author), name});
            expect(link, 'the footer "unsubscribe" link').toBeTruthy();

            // The footer with two authors: "#{submission number} {authors}"
            // reads the Author's family name followed by "et al." (Rule 7a;
            // the link is read, not pressed, A16).
            expect(full.Text).toMatch(
                new RegExp(
                    `Reply to this comment at #${submissionId} Authorson et al\\.[\\s(].*or unsubscribe.*from emails sent by ${escapeRegExp(server.name)}`,
                    's'
                )
            );
            expect(full.Text).not.toMatch(/Coauthor/);

            // Signed in as the Manager, the "unsubscribe" link's page names
            // the Author's address, not the Manager's (Rule 8b).
            const unsubscribe = new UnsubscribePage(managerPage);
            await unsubscribe.goto(link);
            await expect(unsubscribe.sentence()).toContainText(emailOf(author));
            await expect(unsubscribe.sentence()).not.toContainText(emailOf(manager));

            // The stale page: sign out in another tab of the same browser,
            // then "Unsubscribe" on the old page: "We could not unsubscribe
            // you" with its sentence naming the Author's address (Rule 8d).
            const signOutTab = await managerContext.newPage();
            await signOutTab.goto(`/index.php/${server.path}/login/signOut`);
            await signOutTab.waitForURL((url) => !url.pathname.endsWith('/signOut'), {waitUntil: 'commit', timeout: 30_000});
            await expect(new LoginPage(signOutTab).form.or(signOutTab.locator('#navigationUserWrapper')).first()).toBeVisible({timeout: 30_000});
            await signOutTab.close();
            await unsubscribe.unsubscribe();
            await expect(unsubscribe.errorHeading).toBeVisible();
            await expect(unsubscribe.successHeading).toHaveCount(0);
            await expect(unsubscribe.resultSentence()).toHaveText(UNSUBSCRIBE_ERROR(emailOf(author)));

            // The link afresh, still signed out: the page shows again with
            // the Author's address (Rule 8d).
            await unsubscribe.goto(link);
            await expect(unsubscribe.sentence()).toContainText(emailOf(author));
            await expect(unsubscribe.button()).toBeVisible();

            // A sign-in in another tab: the page left open, the Manager
            // signs in again in a second tab of the same browser; back on the
            // page, every box but "Discussion added." unticked, then
            // "Unsubscribe": the success page; a sign-in alone leaves the
            // open page working (Rule 8d).
            const signInTab = await managerContext.newPage();
            await signInAtServer(signInTab, server.path, manager);
            await expect(signInTab.locator('#navigationUserWrapper').or(new TasksPanel(signInTab).bell()).first()).toBeVisible({timeout: 30_000});
            await signInTab.close();
            const boxCount = await unsubscribe.boxes().count();
            expect(boxCount).toBe(OPS_UNSUBSCRIBE_BOXES.length);
            for (let i = 0; i < boxCount; i++) {
                await unsubscribe.boxes().nth(i).uncheck();
            }
            await unsubscribe.box(`email${DISCUSSION_SETTING.charAt(0).toUpperCase()}${DISCUSSION_SETTING.slice(1)}`).check();
            await unsubscribe.unsubscribe();
            await expect(unsubscribe.successHeading).toBeVisible();
            await expect(unsubscribe.errorHeading).toHaveCount(0);
            await expect(unsubscribe.resultSentence()).toContainText(
                `The email address ${emailOf(author)} has been successfully unsubscribed.`
            );

            // "user profile", signed in: the server's Profile page opens on
            // "Identity" (Rule 8e), the Manager's own.
            await unsubscribe.pressProfileLink();
            const managerProfile = new ProfilePage(managerPage, server.path);
            await managerProfile.expectOpen('identity');
            await managerProfile.expectSelectedTab('identity');
            await expect(managerPage).toHaveURL(new RegExp(`/${server.path}/user/profile`));

            // The Author's tab: the email box ticked on "Discussion added."
            // only, every "Enable…" ticked.
            const authorPage = await (await asUser(author)).newPage();
            const authorProfile = await openNotificationsTab(authorPage, server.path);
            const allow = authorProfile.allowBoxes();
            const rows = await allow.count();
            expect(rows).toBeGreaterThan(1);
            for (let i = 0; i < rows; i++) {
                await expect(allow.nth(i)).toBeChecked();
            }
            await expect(checkedEmailBoxes(authorProfile)).toHaveCount(1);
            await expect(authorProfile.notificationPair(DISCUSSION_SETTING).email).toBeChecked();

            // Control: the Manager's own tab is unchanged.
            await managerProfile.goto('notifications');
            await expectTabState(managerProfile, {emailTicked: false});
        } finally {
            await managerContext.close();
        }
    });

    test('S7: the rows, per application, and the site-level tab', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(180_000);
        // A scratch server, so the site holds more than one server (Rule
        // 5d), with a submission whose task reaches `admin` as its
        // auto-enrolled Manager (the Site Administrator has an unread task).
        const tag = makeTag('s7', testInfo);
        const title = `Title ${tag}`;
        const server = await seedServer(opsApi, tag, [
            {username: `${tag}mg`, roles: ['manager']},
            {username: `${tag}au`, roles: ['author']},
        ]);

        // The Preprint Server Manager on the seeded server: the four groups
        // with exactly the server's rows (no issue row: a server has no
        // issues; the reviewer row and the "Weekly email" row listed all
        // the same, OPS1), every "Enable…" ticked, every email box
        // unticked (Fields).
        const managerPage = await (await asUser('manager.maya')).newPage();
        const profile = await openNotificationsTab(managerPage, SERVER);
        await expect(profile.notificationsIntro()).toHaveText(NOTIFICATIONS_INTRO);
        expect(tidyRows(await profile.notificationTable())).toEqual(OPS_TAB);
        await expectTabState(profile, {emailTicked: false});

        // The site's home page as a Manager: the name is bare, with no
        // number; on the server's home page the same name carries one
        // (Rule 4).
        let header = await gotoSiteHome(managerPage);
        await header.expectBareName('manager.maya');
        expect((await hiddenMenuEntries(header)).find((entry) => /^Dashboard/.test(entry))).toBe('Dashboard');
        await expect(header.dashboardCount()).toHaveCount(0);
        header = await gotoServerHome(managerPage, SERVER);
        await expect(header.toggle).toHaveText(/^\s*manager\.maya\s+\d+\s*$/);
        await expect(header.nameCount()).toHaveText(/^\s*\d+\s*$/);

        // The Site Administrator's site-level tab: the same groups without
        // "Statistics report summary." (Rule 5d).
        const adminPage = await (await asUser('admin')).newPage();
        const siteProfile = new ProfilePage(adminPage, null);
        await siteProfile.goto('notifications');
        await expect(adminPage).toHaveURL(/\/index\/(en\/)?user\/profile/);
        expect(tidyRows(await siteProfile.notificationTable())).toEqual(SITE_TAB);

        // The scratch server's submission, seeded right before the reads
        // below: the window lists only `admin`'s 25 newest tasks, and
        // parallel tests raise several a second, so a task raised at the
        // start of the test can be off that page by now (fix list B).
        await opsApi.createSubmission({tag, context: server.path, submitter: `${tag}au`, title});

        // The site-level bell: the same "Tasks" window, with the same rows
        // as from a server's editorial page (Rule 2d); the scratch server's
        // row is in both. The window shows the first 25 of `admin`'s
        // thousands of tasks, newest first to the second: parallel tests
        // raise `admin` tasks between the two reads, and rows tied at the
        // 25th place come back either way, so each read keeps this test's
        // own rows, sorted (fix list B, flake-s26).
        const adminTasks = new TasksPanel(adminPage);
        const ownRows = (rows) => unordered(rows.filter((row) => row.endsWith(` | ${title}`)));
        const readEditorialRows = async () => {
            await gotoEditorial(adminPage, server.path);
            await adminTasks.open();
            await expect(adminTasks.row(title)).toHaveCount(1);
            const rows = await adminTasks.rowTexts();
            await adminTasks.close();
            return ownRows(rows);
        };
        const readSiteRows = async () => {
            await siteProfile.goto('notifications');
            await expect(adminTasks.bell()).toBeVisible();
            await adminTasks.open();
            await expect(adminTasks.row(title)).toHaveCount(1);
            const rows = await adminTasks.rowTexts();
            await adminTasks.close();
            return ownRows(rows);
        };
        const rows = await expectAgreeing(readEditorialRows, readSiteRows, {label: 'the site-level window lists the same rows'});
        expect(rows.length).toBeGreaterThan(0);

        // Control: on the site's own home page the Site Administrator's name
        // is bare too, but the "Dashboard" entry under it reads "Dashboard"
        // followed by the number the bell shows (Rule 4).
        const readSiteBell = async () => {
            await siteProfile.goto('notifications');
            await expect(adminTasks.bell()).toBeVisible();
            return adminTasks.count();
        };
        const readDashboardEntry = async () => {
            const siteHeader = await gotoSiteHome(adminPage);
            await siteHeader.expectBareName('admin');
            const entry = (await hiddenMenuEntries(siteHeader)).find((text) => /^Dashboard/.test(text));
            const match = /^Dashboard (\d+)$/.exec(entry || '');
            expect(match, `the entry reads "${entry}"`).not.toBeNull();
            return Number(match[1]);
        };
        const count = await expectBetweenReads(readSiteBell, readDashboardEntry, {label: 'the "Dashboard" entry carries the bell\'s number'});
        expect(count).toBeGreaterThan(0);

        // Control, narrow: below 992 px, after "Open Menu" on the site's own
        // home page, the name is listed bare and the same entry displays
        // the number, "Dashboard {n}" with {n} the number the bell shows
        // (Rules 4b, 4d), read between two reads of the bell (parallel
        // workers move `admin`'s count, note s7). The window is widened
        // back for each bell read.
        const readNarrowDashboard = async () => {
            const wideSize = await narrowWindow(adminPage);
            try {
                const narrow = new ReaderHeader(adminPage);
                await narrow.gotoNarrowAndOpenMenu('/index.php/index/index');
                await narrow.expectNarrowBareName('admin');
                await expect(narrow.narrowDashboardCount()).toBeVisible();
                const entry = (await narrow.narrowEntryTexts()).find((text) => /^Dashboard/.test(text));
                const match = /^Dashboard (\d+)$/.exec(entry || '');
                expect(match, `the displayed entry reads "${entry}"`).not.toBeNull();
                return Number(match[1]);
            } finally {
                await widenWindow(adminPage, wideSize);
            }
        };
        const narrowCount = await expectBetweenReads(readSiteBell, readNarrowDashboard, {label: 'the displayed "Dashboard" entry carries the bell\'s number'});
        expect(narrowCount).toBeGreaterThan(0);
    });

    test('S8: registration presets the email choice', async ({browser, baseURL, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(180_000);
        const tag = makeTag('s8', testInfo);
        const server = await seedServer(opsApi, tag, [{username: `${tag}mg`, roles: ['manager']}]);

        /** Register a visitor on the scratch server; they land signed in. */
        const registerVisitor = async (username, {notify}) => {
            const context = await anonContext(browser, baseURL);
            const page = await context.newPage();
            const register = new RegisterPage(page);
            await register.goto(server.path);
            await expect(register.heading).toBeVisible({timeout: 30_000});
            await register.fill({
                givenName: 'Vera',
                familyName: 'Visitor',
                affiliation: 'Scratch University',
                country: COUNTRY,
                email: emailOf(username),
                username,
                password: getPassword(username),
                password2: getPassword(username),
            });
            await register.privacyConsentBox.check();
            await expect(register.emailConsentBox).not.toBeChecked();
            if (notify) {
                await register.emailConsentBox.check();
            }
            await register.submit();
            await new RegistrationCompletePage(page).expectShown();
            return {context, page};
        };

        // The first visitor leaves "Yes, I would like to be notified…"
        // unticked: the Public Announcements row has both boxes ticked; the
        // other rows are at their defaults (Rule 5e).
        const firstUser = `${tag}r1`;
        const first = await registerVisitor(firstUser, {notify: false});
        try {
            const profile = await openNotificationsTab(first.page, server.path);
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

            // The reader-side header: on the server's home page the new
            // account's name shows without a number: a Reader sees the bare
            // name (Rule 4; S1's Manager is the control on the same page).
            const header = await gotoServerHome(first.page, server.path);
            await header.expectBareName(firstUser);
        } finally {
            await first.context.close();
        }

        // The second visitor ticks the box: every box at its default.
        const second = await registerVisitor(`${tag}r2`, {notify: true});
        try {
            const profile = await openNotificationsTab(second.page, server.path);
            await expectTabState(profile, {emailTicked: false});
        } finally {
            await second.context.close();
        }
    });

    test('S10: a published version raises a task for the Author', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        const title = `Title ${tag}`;
        const server = await seedServer(opsApi, tag, [
            {username: manager, roles: ['manager']},
            {username: author, roles: ['author']},
        ]);
        // A preprint of the Author's whose version has just been posted (the
        // seed's `published: true` posts it the way the workflow does; note
        // s10).
        await opsApi.createSubmission({tag, context: server.path, submitter: author, title, submitted: true, published: true});

        // The bell: the Author opens an editorial page after the publish: a
        // red "1" (Rule 2a).
        const authorPage = await (await asUser(author)).newPage();
        const authorTasks = new TasksPanel(authorPage);
        await gotoMySubmissions(authorPage, server.path);
        await authorTasks.expectCount(1);

        // The Tasks window: one row, bold, 'A new version of your
        // submission, "{title}", was published.', the title inside the
        // sentence and no title line under it (Rules 2b, 6).
        await authorTasks.open();
        await expect(authorTasks.rows()).toHaveCount(1);
        const row = authorTasks.rows().first();
        await authorTasks.expectUnread(row);
        await expect(authorTasks.sentence(row)).toHaveText(
            `${NEW_VERSION_OPENING}, "${title}", was published.`
        );
        await expect(authorTasks.title(row)).toHaveCount(0);
        await expect(row).toContainText(title);

        // Control: the Preprint Server Manager's window holds no row opening
        // "A new version of your submission" for this title, while it holds
        // the "needs a moderator" row the same submission raised, with the
        // title under it (Rule 2b; the positive control for the missing
        // title line above): the task goes to every user holding an Author
        // assignment on the submission (Rule 6).
        const managerPage = await (await asUser(manager)).newPage();
        const managerTasks = new TasksPanel(managerPage);
        await gotoEditorial(managerPage, server.path);
        await managerTasks.open();
        await expect(managerTasks.row(title)).toHaveCount(1);
        await expect(managerTasks.sentence(managerTasks.row(title))).toHaveText(NEEDS_EDITOR_TASK);
        await expect(managerTasks.title(managerTasks.row(title))).toHaveText(title);
        await expect(managerTasks.rowsOpening(new RegExp(`^\\s*${escapeRegExp(NEW_VERSION_OPENING)}`))).toHaveCount(0);
    });
});
