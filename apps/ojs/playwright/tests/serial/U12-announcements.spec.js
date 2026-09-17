// @ts-check
/**
 * @file playwright/tests/serial/U12-announcements.spec.js
 *
 * Announcements — the two scenarios that cannot run beside the parallel
 * suite: S4 (the email and who gets it) drains the site's job queue with
 * `runJobs()`, which pops the SHARED queue and must never run while parallel
 * workers seed (patterns.md parallel lesson 7); S6 (the site's announcements)
 * ticks the site's own "Enable announcements", a setting every test reading
 * the site's home page would see, and restores it (PRINCIPLES A7, A9).
 * Spec: docs/specs/U12-announcements.md
 *
 * Coverage boundaries are declared in the parallel suite's header
 * (playwright/tests/U12-announcements.spec.js); this file adds only:
 * - S4 reads the mail after the drain, never "still nothing before the
 *   jobs run": another serial worker's drain may pop the job first, and
 *   footnote s4 drains and reads (that reading would need `@solo`);
 * - the "New Announcement" email's "full announcement" link carries the
 *   config `base_url` host (worker 0's port, seed-facts), so S4 opens the
 *   link's path on its own origin;
 * - S6's Tasks silence is not re-read (S4 reads it once on a journal).
 *
 * Mailpit is shared across fleets and workers: every read is scoped by a
 * throwaway recipient (or `admin@mail.test` for the site administrator,
 * with the run's tag as the content marker), and every silence rides on a
 * message delivered by the same queue drain.
 */
const {test, expect} = require('../../support/fixtures.js');
const {ProfilePage, SAVED_MESSAGE} = require('../../../../../shared/playwright/pages/ProfilePage.js');
const {successToasts, TasksPanel} = require('../../../../../shared/playwright/pages/NotificationsPages.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');
const {
    SiteAnnouncementsTab,
    AnnouncementsPage,
    PublicAnnouncements,
    AnnouncementView,
    homeBlock,
    gotoHome,
    expectNotFound,
    skipToAnnouncements,
} = require('../../pages/AnnouncementsPages.js');

const ANNOUNCEMENT_SETTING = 'notificationNewAnnouncement';
const ANNOUNCEMENT_ROW = 'A new announcement has been created.';
const ENABLE_LABEL = 'Enable these types of notifications.';
const EMAIL_LABEL = 'Do not send me an email for these types of notifications.';
const SITE = 'index';
const ADMIN_MAIL = 'admin@mail.test';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u12${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for the scratch journal (users.md: `<username>@mail.test`). */
function account(tag, suffix, givenName, familyName, role) {
    return {username: `${tag}${suffix}`, givenName, familyName, email: `${tag}${suffix}@mail.test`, roles: [role]};
}

const mailOf = (username) => `${username}@mail.test`;

/** A signed-out browser context (no inherited storage state). */
async function signedOut(browser, baseURL) {
    return browser.newContext({baseURL, storageState: {cookies: [], origins: []}, reducedMotion: 'reduce'});
}

/**
 * Add an announcement through the panel: title, short description, the
 * email box as asked; the row is listed. Its position is not read here: two
 * adds within one second share a posted second and the list's order among
 * them is arbitrary (scenarios.md); S2 reads positions with public reads
 * between the adds.
 */
async function addAnnouncement(list, {title, shortDescription, sendEmail = false}) {
    const panel = await list.openAdd();
    await panel.titleInput().fill(title);
    if (shortDescription) {
        await panel.typeShortDescription(shortDescription);
    }
    if (sendEmail) {
        await panel.sendEmailBox().check();
    } else {
        await expect(panel.sendEmailBox()).not.toBeChecked();
    }
    const id = await panel.save();
    await expect(list.row(title)).toBeVisible();
    return id;
}

/**
 * The site's announcements and types are shared by every test on the
 * install (PRINCIPLES A7): remove what S6 made, whatever happened, then
 * leave the site's box unticked. The list and the types show only while
 * the box is ticked, so it is ticked for the sweep and unticked after.
 */
async function restoreSite(site) {
    await site.goto();
    const form = site.settingsForm();
    if (!(await form.enableBox().isChecked())) {
        await form.enableBox().check();
        await form.save();
    }
    await site.openSideTab('items');
    const list = site.list();
    await expect(list.panel).toBeVisible();
    await expect(list.rows().or(list.emptyMessage()).first()).toBeVisible();
    for (const title of await list.rowTitles()) {
        if (/^Site maintenance/.test(title)) {
            await list.deleteAnnouncement(title);
        }
    }
    await site.openSideTab('types');
    const types = site.types();
    await expect(types.grid).toBeVisible();
    // The legacy grid fetches its rows after it mounts: wait for a row or
    // the empty row before reading the names.
    await expect(types.rows().or(types.emptyMessage()).first()).toBeVisible();
    for (const name of await types.rowNames()) {
        if (name === 'Site news') {
            await types.openRemove(name);
            await types.confirmDialog().getByRole('button', {name: 'OK', exact: true}).click();
            await expect(types.toast('Announcement type removed.')).toBeVisible();
        }
    }
    await site.openSideTab('settings');
    const formAgain = site.settingsForm();
    await formAgain.enableBox().uncheck();
    await formAgain.save();
}

test.describe('announcements (queued email; the site)', () => {
    test('S4: the email and who gets it', async ({browser, baseURL, asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        const manager = `${tag}mg`;
        const reader = `${tag}rd`;
        const author = `${tag}au`;
        const sectionEditor = `${tag}se`;
        const spare = `${tag}x`;
        await ojsApi.createContext({
            tag,
            enableAnnouncements: true,
            users: [
                account(tag, 'mg', 'Mira', 'Manager', 'manager'),
                account(tag, 'rd', 'Rita', 'Reader', 'reader'),
                account(tag, 'au', 'Ada', 'Author', 'author'),
                account(tag, 'se', 'Sara', 'Sectioneditor', 'sectionEditor'),
                account(tag, 'x', 'Xena', 'Spare', 'author'),
            ],
        });

        // The givens the scenario sets through Profile › Notifications
        // (footnote s4): the Author unticks "Enable…" on the announcement
        // row, the Section Editor ticks "Do not send me an email…".
        const authorPage = await (await asUser(author)).newPage();
        const authorProfile = new ProfilePage(authorPage, tag);
        await authorProfile.goto('notifications');
        await authorProfile.notificationPair(ANNOUNCEMENT_SETTING).allow.uncheck();
        await authorProfile.save();
        await expect(successToasts(authorPage).filter({hasText: SAVED_MESSAGE})).toBeVisible();
        await authorPage.close();
        const sePage = await (await asUser(sectionEditor)).newPage();
        const seProfile = new ProfilePage(sePage, tag);
        await seProfile.goto('notifications');
        await seProfile.notificationPair(ANNOUNCEMENT_SETTING).email.check();
        await seProfile.save();
        await expect(successToasts(sePage).filter({hasText: SAVED_MESSAGE})).toBeVisible();
        await sePage.close();

        // The row's defaults, as the Journal Manager: "Enable…" ticked and
        // "Do not send me an email…" unticked on "A new announcement has
        // been created." (Settings).
        const page = await (await asUser(manager)).newPage();
        const profile = new ProfilePage(page, tag);
        await profile.goto('notifications');
        const pair = profile.notificationPair(ANNOUNCEMENT_SETTING);
        const row = profile.form('notifications').locator('.section').filter({hasText: ANNOUNCEMENT_ROW});
        await expect(row).toHaveCount(1);
        await expect(row).toContainText(ENABLE_LABEL);
        await expect(row).toContainText(EMAIL_LABEL);
        await expect(pair.allow).toBeChecked();
        await expect(pair.email).not.toBeChecked();

        // An announcement without the email, then one with it: each is
        // the first row; signed out, the second is already public (Rules
        // 5, 17; Fields "Send Email").
        const admin = new AnnouncementsPage(page, tag);
        const list = admin.list();
        await admin.goto();
        await addAnnouncement(list, {title: 'Board meeting', shortDescription: 'Agenda to follow.'});
        const callId = await addAnnouncement(list, {title: 'Call for papers', shortDescription: 'Deadline 1 June.', sendEmail: true});
        expect((await list.rowTitles()).sort()).toEqual(['Board meeting', 'Call for papers']);
        const visitor = await (await signedOut(browser, baseURL)).newPage();
        const publicList = new PublicAnnouncements(visitor, tag);
        await publicList.goto();
        expect((await publicList.titles()).sort()).toEqual(['Board meeting', 'Call for papers']);

        // The email: the site's background jobs run; the mail catcher
        // holds one "New Announcement" email for the Journal Manager and
        // one for the Reader, subject the title, From the manager, the body
        // with the title in bold, the short description, the sentence with
        // its "full announcement" link and the Unsubscribe footer; the link
        // opens the announcement's page (Side effects; Rule 10).
        runJobs();
        const managerMail = await pkpMail.find({to: mailOf(manager), contains: tag});
        const readerMail = await pkpMail.find({to: mailOf(reader), contains: tag});
        for (const [who, summary] of [
            ['the manager', managerMail],
            ['the reader', readerMail],
        ]) {
            expect(summary.Subject, `${who}'s subject`).toBe('Call for papers');
            expect(summary.From.Name, `${who}'s From line`).toBe('Mira Manager');
            expect(summary.From.Address, `${who}'s From address`).toBe(mailOf(manager));
            const full = await pkpMail.fullMessage(summary.ID);
            expect(full.HTML).toMatch(/<(b|strong)[^>]*>\s*Call for papers\s*<\/(b|strong)>/);
            expect(full.Text).toContain('Deadline 1 June.');
            // The plain-text rendering prints the link's address in
            // parentheses before the full stop; the HTML carries the sentence.
            expect(full.Text).toMatch(/Visit our website to read the full announcement/);
            expect(full.HTML.replace(/<[^>]+>/g, '')).toContain('Visit our website to read the full announcement.');
            expect(full.Text).toMatch(/Unsubscribe/);
            expect(pkpMail.extractLink(full.HTML, /^full announcement$/i), `${who}'s "full announcement" link`).toMatch(
                new RegExp(`/${tag}/(en/)?announcement/view/${callId}$`)
            );
        }
        expect(await pkpMail.count({to: mailOf(manager), contains: tag}), 'one email to the manager').toBe(1);
        expect(await pkpMail.count({to: mailOf(reader), contains: tag}), 'one email to the reader').toBe(1);
        const link = new URL(pkpMail.extractLink((await pkpMail.fullMessage(readerMail.ID)).HTML, /^full announcement$/i));
        await visitor.goto(link.pathname + link.search);
        await expect(new AnnouncementView(visitor, tag).heading()).toHaveText('Call for papers');

        // Who gets nothing: no email for the Author or the Section Editor,
        // none titled "Board meeting" for anyone; the Reader's email above,
        // delivered by the same drain, bounds the reads (Side effects).
        expect(await pkpMail.count({to: mailOf(author), contains: tag}), 'no mail to the author').toBe(0);
        expect(await pkpMail.count({to: mailOf(sectionEditor), contains: tag}), 'no mail to the section editor').toBe(0);
        for (const username of [manager, reader, author, sectionEditor]) {
            expect(await pkpMail.count({to: mailOf(username), subject: 'Board meeting'}), `no "Board meeting" mail to ${username}`).toBe(0);
        }

        // Nothing else: the manager's Tasks panel reads "No Items" after
        // the jobs ran; then a submission seeded on the journal is the
        // positive control, the same bell carrying its task (Side effects).
        await page.goto(`/index.php/${tag}/dashboard/editorial`);
        const tasks = new TasksPanel(page);
        await tasks.expectCount(0);
        await tasks.open();
        await expect(tasks.noItems()).toBeVisible();
        await expect(tasks.rows()).toHaveCount(0);
        await tasks.close();
        await ojsApi.createSubmission({tag, context: tag, submitter: spare, title: `Submission ${tag}`});
        await page.reload();
        await tasks.expectCount(1);

        // Control: the seeded journal's Reader, with no role in the scratch
        // journal, gets no email either, read after the Reader's arrived
        // (Actors row 6; Rule 1).
        expect(await pkpMail.count({to: 'reader.rosa@mail.test', contains: tag}), 'no mail to reader.rosa').toBe(0);
    });

    test("S6: the site's announcements", async ({browser, baseURL, asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s6', testInfo);
        const manager = `${tag}mg`;
        await ojsApi.createContext({
            tag,
            enableAnnouncements: true,
            users: [account(tag, 'mg', 'Mira', 'Manager', 'manager')],
        });
        const page = await (await asUser('admin')).newPage();
        const visitor = await (await signedOut(browser, baseURL)).newPage();
        const site = new SiteAnnouncementsTab(page);
        const sitePublic = new PublicAnnouncements(visitor, SITE);
        const siteHome = homeBlock(visitor);

        try {
            // The site's pages while off: the site's Announcements page
            // answers "404 Not Found" and the site's home page has no
            // block (Rules 2, 16).
            await expectNotFound(visitor, sitePublic.url());
            await gotoHome(visitor, SITE);
            await expect(siteHome.section).toHaveCount(0);
            await expect(skipToAnnouncements(visitor)).toHaveCount(0);

            // The site's tab: three side tabs; "Announcements" and
            // "Announcement Types" read "You must enable announcements."
            // with "enable announcements" a link to "Settings" (Rule 16).
            await site.goto();
            await expect(site.sideTab('settings')).toHaveText(/Settings/);
            await expect(site.sideTab('items')).toHaveText(/Announcements/);
            await expect(site.sideTab('types')).toHaveText(/Announcement Types/);
            await site.openSideTab('items');
            await expect(site.mustEnableText()).toBeVisible();
            await expect(site.mustEnableLink()).toBeVisible();
            await expect(site.list().panel).toHaveCount(0);
            await site.openSideTab('types');
            await expect(site.mustEnableText()).toBeVisible();
            await expect(site.types().grid).toHaveCount(0);
            await site.mustEnableLink().click();
            await expect(site.sideTab('settings')).toHaveAttribute('aria-selected', 'true');

            // Switched on: the box, the introduction and "1"; saved, the
            // two side tabs show the list panel and the types table with no
            // reload (Rule 16; Fields).
            const form = site.settingsForm();
            await expect(form.enableBox()).not.toBeChecked();
            await form.enableBox().check();
            await form.typeIntroduction('News from the site.');
            await form.countInput().fill('1');
            await form.save();
            await site.openSideTab('items');
            const list = site.list();
            await expect(list.emptyMessage()).toBeVisible();
            await expect(list.searchBox()).toBeVisible();
            await expect(list.addButton()).toBeVisible();
            await site.openSideTab('types');
            await expect(site.types().emptyMessage()).toBeVisible();

            // A site announcement, with the email box ticked: the only row;
            // found by "Search"; edited in place (Rules 4–6, 16).
            await site.openSideTab('items');
            const siteId = await addAnnouncement(list, {title: 'Site maintenance', shortDescription: 'Sunday morning.', sendEmail: true});
            await expect(list.rows()).toHaveCount(1);
            await list.search('maintenance');
            await expect(list.rows()).toHaveCount(1);
            await expect.poll(() => list.rowTitles()).toEqual(['Site maintenance']);
            const panel = await list.openEdit('Site maintenance');
            await panel.titleInput().fill('Site maintenance on Sunday');
            await panel.save();
            await expect(list.rows()).toHaveCount(1);
            await expect.poll(() => list.rowTitles()).toEqual(['Site maintenance on Sunday']);

            // The site's pages on: the site's Announcements page with its
            // heading, introduction and the summary; the site's home page
            // block and skip link; "Read More" opens the announcement's
            // page; the scratch journal's pages show none of it (Rules 1,
            // 9–11, 16).
            await sitePublic.goto();
            await expect(sitePublic.heading()).toHaveText('Announcements');
            await expect(sitePublic.container()).toContainText('News from the site.');
            await expect(sitePublic.articles()).toHaveCount(1);
            const summary = sitePublic.summary('Site maintenance on Sunday');
            await expect(summary.titleLink).toHaveText('Site maintenance on Sunday');
            await expect(summary.summary).toContainText('Sunday morning.');
            await expect(summary.readMoreVisible).toHaveText('Read More');
            await gotoHome(visitor, SITE);
            await expect(siteHome.section).toBeVisible();
            await expect(siteHome.heading).toHaveText('Announcements');
            await expect(siteHome.articles).toHaveCount(1);
            await expect(siteHome.first.titleLink).toHaveText('Site maintenance on Sunday');
            await expect(siteHome.first.summary).toContainText('Sunday morning.');
            await expect(skipToAnnouncements(visitor)).toHaveText('Skip to announcements');
            await siteHome.first.readMore.click();
            const siteView = new AnnouncementView(visitor, SITE);
            await expect(siteView.heading()).toHaveText('Site maintenance on Sunday');
            await expect(visitor).toHaveURL(new RegExp(`/${SITE}/(en/)?announcement/view/${siteId}$`));
            const journalPublic = new PublicAnnouncements(visitor, tag);
            await journalPublic.goto();
            await expect(journalPublic.articles()).toHaveCount(0);
            await expect(journalPublic.container()).not.toContainText('Site maintenance');
            await gotoHome(visitor, tag);
            await expect(homeBlock(visitor).section).toHaveCount(0);
            await expect(visitor.locator('.pkp_structure_main')).not.toContainText('Site maintenance');

            // Control first, so the silence below rides on it: "Journal
            // notice", added on the scratch journal with the email box
            // ticked, mails the Site Administrator, who holds a role there
            // (Actors row 6).
            const managerPage = await (await asUser(manager)).newPage();
            const journalAdmin = new AnnouncementsPage(managerPage, tag);
            await journalAdmin.goto();
            await addAnnouncement(journalAdmin.list(), {title: `Journal notice ${tag}`, shortDescription: 'From the journal.', sendEmail: true});
            await managerPage.close();

            // No email: the site's background jobs run; the mail catcher
            // holds no email titled "Site maintenance" for the Site
            // Administrator, read after the journal's notice arrived
            // (Actors row 6; Rule 16).
            runJobs();
            await pkpMail.expectNone({
                to: ADMIN_MAIL,
                subject: 'Site maintenance',
                afterControl: {to: ADMIN_MAIL, subject: `Journal notice ${tag}`},
            });
            expect(await pkpMail.count({to: ADMIN_MAIL, contains: 'Sunday morning.'}), 'no site announcement mail').toBe(0);

            // A site type: added with its toast and row (Rule 16).
            await site.goto();
            await site.openSideTab('types');
            const types = site.types();
            await types.openAdd();
            await types.nameInput('en').fill('Site news');
            await types.save();
            await expect(types.toast('Announcement type added.')).toBeVisible();
            await expect(types.row('Site news')).toHaveCount(1);

            // Deleted and switched off: the row gone; the box unticked and
            // saved; signed out, the site's Announcements page answers "404
            // Not Found" again and the home page has no block (Rules 2, 7, 16).
            // The site's type is removed first: the scenario leaves it,
            // but the site is shared state and the next run reads the
            // empty table (PRINCIPLES A7).
            await types.openRemove('Site news');
            await types.confirmDialog().getByRole('button', {name: 'OK', exact: true}).click();
            await expect(types.toast('Announcement type removed.')).toBeVisible();
            await expect(types.row('Site news')).toHaveCount(0);
            await site.openSideTab('items');
            await list.deleteAnnouncement('Site maintenance on Sunday');
            await expect(list.emptyMessage()).toBeVisible();
            await site.openSideTab('settings');
            const formAgain = site.settingsForm();
            await expect(formAgain.enableBox()).toBeChecked();
            await formAgain.enableBox().uncheck();
            await formAgain.save();
            await expectNotFound(visitor, sitePublic.url());
            await gotoHome(visitor, SITE);
            await expect(siteHome.section).toHaveCount(0);
            await expect(skipToAnnouncements(visitor)).toHaveCount(0);
        } finally {
            await restoreSite(site);
        }
    });
});
