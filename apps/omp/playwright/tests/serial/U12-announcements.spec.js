// @ts-check
/**
 * @file playwright/tests/serial/U12-announcements.spec.js
 *
 * Announcements — OMP suite, the serial part: S4 (the email and who gets
 * it) and S6 (the site's announcements). The parallel scenarios (S1, S2,
 * S3, S5 and S7's absence) and the suite's coverage boundaries are in
 * `../U12-announcements.spec.js`. Spec: docs/specs/U12-announcements.md
 *
 * Serial project, on purpose (PRINCIPLES A7, A9; patterns.md parallel
 * lesson 7): the "New Announcement" email and its notification are queued
 * and the fleets run with `[queues] job_runner = Off`, so both tests drain
 * the SHARED queue with `runJobs()` after their adds; S6 also ticks and
 * unticks the site's own "Enable announcements", fleet-global state every
 * test reading the site's home page would see, and restores it before it
 * returns (a best-effort restore runs even when the test fails midway).
 * S4 additionally asserts "nothing has reached the mail catcher yet"
 * between its ticked add and its own drain, which no other test's drain
 * may race, so it carries `@solo` and runs alone in the `omp-solo` project
 * after the serial one (harness.md "Project chain").
 *
 * Not asserted here, by register ID: A9 🐞 (no edit ticks the email box),
 * A14 🐞 (the press's primary language is English, so the email's sentence
 * is the English one either way). S4's Notifications-row givens for the
 * Author and the Series editor are set through Profile › Notifications by
 * the test, as footnote s4 says (the tab is *Notifications center & email
 * preferences*'; there is no seed key for it).
 *
 * Mailpit is shared across fleets and workers: every read is scoped by a
 * throwaway recipient whose address carries app + test, the absences ride
 * on the Reader's email delivered by the same drain (`expectNone`), and
 * the site announcement's silence rides on a press announcement mailed to
 * the Site Administrator by the same drain. A job-sent email's link
 * carries the install's configured base address (seed-facts), so the
 * link's path is opened on the test's own origin.
 */
const {test: base, expect} = require('../../support/fixtures.js');
const {AnnouncementsPage, SiteAnnouncementsTab, PublicAnnouncements} = require('../../pages/AnnouncementsPages.js');
const {ProfilePage, SAVED_MESSAGE} = require('../../../../../shared/playwright/pages/ProfilePage.js');
const {TasksPanel, successToasts} = require('../../../../../shared/playwright/pages/NotificationsPages.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');
const {getEmail} = require('../../../../../shared/playwright/data/users.js');

const NEW_ANNOUNCEMENT_ROW = 'New announcement.';
const NEW_ANNOUNCEMENT_SETTING = 'notificationNewAnnouncement';
const SITE = 'index';
const CFP = 'Call for papers';
const CFP_SHORT = 'Deadline 1 June.';
const T = 30_000;

/** A visitor's page: a second browser context with no session at all (parallel lesson 8). */
const test = base.extend({
    visitor: async ({browser, baseURL}, use) => {
        const context = await browser.newContext({
            baseURL,
            storageState: {cookies: [], origins: []},
            reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        await use(page);
        await context.close();
    },
});

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u12${scenario}ompw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A scratch press user spec; its address names app + test. */
function scratchUser(tag, key, given, family, roles) {
    return {
        username: `${tag}${key}`,
        givenName: given,
        familyName: family,
        email: `${tag}${key}@mail.test`,
        roles,
    };
}

/** Save the visible Profile tab and wait for its "Your changes have been saved." notice. */
async function saveProfile(page, profile) {
    await profile.save();
    await expect(successToasts(page).filter({hasText: SAVED_MESSAGE})).toBeVisible({timeout: T});
}

/**
 * Best-effort restore of the site's announcements after S6 (PRINCIPLES
 * A7): every row of the site's list deleted, every "Site news" type
 * removed, "Enable announcements" unticked and saved. Runs in S6's
 * `finally`; a step that finds nothing to do is skipped.
 */
async function restoreSite(page) {
    const site = new SiteAnnouncementsTab(page);
    await site.goto();
    await site.openSideTab('settings');
    const form = site.form();
    if (!(await form.enableBox().isChecked())) {
        return;
    }
    await site.openSideTab('items');
    const list = site.list();
    await expect(list.panel()).toBeVisible({timeout: T});
    while ((await list.rows().count()) > 0) {
        const title = (await list.titles().first().innerText()).trim();
        await list.openDelete(title);
        await list.answerDelete('Yes');
        await expect(list.row(title)).toHaveCount(0, {timeout: T});
    }
    await site.openSideTab('types');
    const types = site.types();
    await expect(types.grid()).toBeVisible({timeout: T});
    while ((await types.row('Site news').count()) > 0) {
        await types.openRemove('Site news');
        await types.answerRemove('OK');
        await site.goto();
        await site.openSideTab('types');
    }
    await site.openSideTab('settings');
    await form.enableBox().uncheck();
    await form.save();
}

test.describe('Announcements (U12), queued email and the site', () => {
    test('S4: the email and who gets it @solo', async ({asUser, ompApi, pkpMail, visitor}, testInfo) => {
        test.slow();
        test.setTimeout(420_000);
        const tag = makeTag('s4', testInfo);
        const manager = scratchUser(tag, 'mg', 'Mona', 'Manager', ['manager']);
        const reader = scratchUser(tag, 'rd', 'Rosa', 'Reader', ['reader']);
        const author = scratchUser(tag, 'au', 'Ada', 'Author', ['author']);
        const seriesEditor = scratchUser(tag, 'se', 'Sela', 'Series', ['sectionEditor']);
        await ompApi.createContext({tag, enableAnnouncements: true, users: [manager, reader, author, seriesEditor]});
        const pub = new PublicAnnouncements(visitor);

        // The row's defaults: as the Press Manager the "New announcement."
        // row of Profile › Notifications has "Enable these types of
        // notifications." ticked and "Do not send me an email…" unticked
        // (Settings).
        const page = await (await asUser(manager.username)).newPage();
        const managerProfile = new ProfilePage(page, tag);
        await managerProfile.goto('notifications');
        const row = managerProfile.notificationRow(NEW_ANNOUNCEMENT_ROW);
        await expect(row).toHaveCount(1);
        const managerPair = managerProfile.notificationPair(NEW_ANNOUNCEMENT_SETTING);
        await expect(row.locator(`input#${NEW_ANNOUNCEMENT_SETTING}`)).toHaveCount(1);
        await expect(managerPair.allow).toBeChecked();
        await expect(managerPair.email).not.toBeChecked();

        // The given: the Author unticks "Enable…" on that row, the Series
        // editor ticks "Do not send me an email…" (footnote s4: a scenario
        // step, not a seed).
        const authorPage = await (await asUser(author.username)).newPage();
        const authorProfile = new ProfilePage(authorPage, tag);
        await authorProfile.goto('notifications');
        await authorProfile.notificationPair(NEW_ANNOUNCEMENT_SETTING).allow.uncheck();
        await saveProfile(authorPage, authorProfile);
        const sePage = await (await asUser(seriesEditor.username)).newPage();
        const seProfile = new ProfilePage(sePage, tag);
        await seProfile.goto('notifications');
        await seProfile.notificationPair(NEW_ANNOUNCEMENT_SETTING).email.check();
        await saveProfile(sePage, seProfile);

        // An announcement without the email: "Board meeting" is the first
        // row (Rule 5; Fields "Send Email").
        const mgmt = new AnnouncementsPage(page);
        await mgmt.goto(tag);
        const list = mgmt.list();
        await list.add({title: 'Board meeting', shortDescription: 'Agenda to follow.'});
        await expect(list.titles()).toHaveText(['Board meeting']);

        // An announcement with the email: "Call for papers" is the first
        // row; signed out, it is already public, while nothing has reached
        // the mail catcher yet (Rule 17; Side effects).
        let panel = await list.openAdd();
        await panel.fill({title: CFP, shortDescription: CFP_SHORT});
        await panel.sendEmailBox().check();
        const cfp = await panel.save();
        await expect(list.titles()).toHaveText([CFP, 'Board meeting']);
        await pub.gotoList(tag);
        await expect(pub.summary(CFP)).toHaveCount(1);
        expect(await pkpMail.count({to: manager.email, subject: CFP})).toBe(0);
        expect(await pkpMail.count({to: reader.email, subject: CFP})).toBe(0);

        // The email: after the jobs, one "New Announcement" email each for
        // the Press Manager, who posted it, and the Reader: the subject,
        // the From line, the body's bold title, short description, the
        // "full announcement" link and the Unsubscribe footer; the link
        // opens the announcement's page (Side effects; Rule 10).
        runJobs();
        const control = {to: reader.email, subject: CFP};
        const readerMail = await pkpMail.find(control);
        const managerMail = await pkpMail.find({to: manager.email, subject: CFP});
        for (const mail of [readerMail, managerMail]) {
            expect(mail.Subject).toBe(CFP);
            expect(mail.From).toMatchObject({Name: 'Mona Manager', Address: manager.email});
        }
        expect(await pkpMail.count({to: manager.email, subject: CFP})).toBe(1);
        expect(await pkpMail.count({to: reader.email, subject: CFP})).toBe(1);
        const full = await pkpMail.fullMessage(readerMail.ID);
        expect(full.HTML).toMatch(new RegExp(`<b>\\s*${CFP}\\s*</b>`));
        expect(full.Text).toContain(CFP_SHORT);
        expect(full.Text).toMatch(/Visit our website to read the full announcement/);
        expect(full.Text).toMatch(/Unsubscribe/);
        const link = pkpMail.extractLink(full.HTML, /full announcement/i);
        expect(link, 'the "full announcement" link').toMatch(new RegExp(`/${tag}/announcement/view/${cfp.id}$`));
        const target = new URL(link);
        await visitor.goto(`${target.pathname}${target.search}`);
        await expect(pub.heading()).toHaveText(CFP);

        // Who gets nothing: no email for the Author or the Series editor,
        // and none titled "Board meeting" for anyone, read after the
        // Reader's arrived (Side effects).
        await pkpMail.expectNone({to: author.email, afterControl: control});
        await pkpMail.expectNone({to: seriesEditor.email, afterControl: control});
        for (const user of [manager, reader, author, seriesEditor]) {
            await pkpMail.expectNone({to: user.email, subject: 'Board meeting', afterControl: control});
        }

        // Nothing else: the Press Manager's Tasks panel reads "No Items"
        // (Side effects).
        await mgmt.goto(tag);
        const tasks = new TasksPanel(page);
        await tasks.expectCount(0);
        await tasks.open();
        await expect(tasks.rows()).toHaveCount(0);
        await expect(tasks.noItems()).toBeVisible();
        await tasks.close();

        // Control: the seeded press's Reader, with no role in the scratch
        // press, gets no email either (Actors row 6; Rule 1).
        await pkpMail.expectNone({to: getEmail('reader.rosa'), subject: CFP, afterControl: control});
    });

    test("S6: the site's announcements", async ({asUser, ompApi, pkpMail, visitor}, testInfo) => {
        test.slow();
        test.setTimeout(420_000);
        const tag = makeTag('s6', testInfo);
        const manager = scratchUser(tag, 'mg', 'Mona', 'Manager', ['manager']);
        await ompApi.createContext({tag, enableAnnouncements: true, users: [manager]});
        const adminEmail = getEmail('admin');
        const SITE_TITLE = 'Site maintenance';
        const SITE_TITLE_EDITED = 'Site maintenance on Sunday';
        const SITE_SHORT = 'Sunday morning.';
        const NOTICE = 'Journal notice';
        const pub = new PublicAnnouncements(visitor);

        const adminPage = await (await asUser('admin')).newPage();
        try {
            // The site's pages while off: the site's Announcements page
            // reads "404 Not Found" and the site's home page has no block
            // (its other skip links are the control) (Rules 2, 16).
            await pub.expectNotFound(PublicAnnouncements.listUrl(SITE));
            await pub.gotoHome(SITE);
            await expect(pub.skipLinks().first()).toHaveText('Skip to main content');
            await expect(pub.homeBlock()).toHaveCount(0);
            await expect(pub.skipToAnnouncements()).toHaveCount(0);

            // The site's tab: the three side tabs; "Announcements" and
            // "Announcement Types" read "You must enable announcements."
            // with "enable announcements" a link to "Settings" (Rule 16).
            const site = new SiteAnnouncementsTab(adminPage);
            await site.goto();
            await expect(site.sideTab('settings')).toHaveText('Settings');
            await expect(site.sideTab('items')).toHaveText('Announcements');
            await expect(site.sideTab('types')).toHaveText('Announcement Types');
            for (const key of ['items', 'types']) {
                await site.openSideTab(key);
                await expect(site.notEnabledText()).toBeVisible();
                await expect(site.notEnabledLink()).toHaveAttribute('href', '#announcements/announcement-settings');
                await expect(site.list().panel()).toHaveCount(0);
            }

            // Switched on: the box, "News from the site." and "1", "Save":
            // with no reload (a window marker survives), "Announcements"
            // shows the list panel with "No items found.", "Search" and
            // "Add Announcement", and "Announcement Types" the empty table
            // (Rule 16; Fields).
            await site.openSideTab('settings');
            const form = site.form();
            await expect(form.enableBox()).not.toBeChecked();
            await form.enableBox().check();
            await form.typeIntroduction('News from the site.');
            await form.countInput().fill('1');
            await adminPage.evaluate(() => {
                // @ts-ignore a marker on the window the save must not reload away
                window.__u12NoReload = true;
            });
            await form.save();
            await site.openSideTab('items');
            const list = site.list();
            await expect(list.panel()).toBeVisible();
            await expect(list.noItems()).toBeVisible();
            await expect(list.searchBox()).toBeVisible();
            await expect(list.addButton()).toBeVisible();
            await expect(site.notEnabledText()).toHaveCount(0);
            await site.openSideTab('types');
            const types = site.types();
            await expect(types.grid()).toBeVisible();
            await expect(types.noneCreated()).toBeVisible();
            // @ts-ignore the marker
            expect(await adminPage.evaluate(() => window.__u12NoReload)).toBe(true);

            // A site announcement: added with the email box ticked, it is
            // the only row; "Search" finds it; "Edit" renames it in place
            // (Rules 4–6, 16).
            await site.openSideTab('items');
            let panel = await list.openAdd();
            await panel.fill({title: SITE_TITLE, shortDescription: SITE_SHORT});
            await panel.sendEmailBox().check();
            const siteAnnouncement = await panel.save();
            await expect(list.titles()).toHaveText([SITE_TITLE]);
            await list.search('maintenance');
            await expect(list.titles()).toHaveText([SITE_TITLE]);
            panel = await list.openEdit(SITE_TITLE);
            await expect(panel.titleInput()).toHaveValue(SITE_TITLE);
            await panel.titleInput().fill(SITE_TITLE_EDITED);
            await panel.save();
            await expect(list.titles()).toHaveText([SITE_TITLE_EDITED]);

            // The control's press announcement, added with the email box
            // ticked before the jobs run: "Journal notice" on the scratch
            // press mails the Site Administrator, who holds a role there
            // (Actors row 6).
            const managerPage = await (await asUser(manager.username)).newPage();
            const mgmt = new AnnouncementsPage(managerPage);
            await mgmt.goto(tag);
            await mgmt.list().add({title: NOTICE, shortDescription: 'For the press.', sendEmail: true});

            // The site's pages on: signed out, the site's Announcements
            // page shows the heading, the introduction and the summary
            // with "Read More"; the site's home page the block and the
            // skip link; "Read More" opens the announcement's page; the
            // scratch press's pages show none of it (Rules 1, 9–11, 16).
            await pub.gotoList(SITE);
            await expect(pub.heading()).toHaveText('Announcements');
            await expect(pub.introduction()).toContainText('News from the site.');
            await expect(pub.summaries()).toHaveCount(1);
            const summary = pub.summary(SITE_TITLE_EDITED);
            await expect(pub.summaryText(summary)).toContainText(SITE_SHORT);
            await expect(pub.readMore(summary)).toBeVisible();
            await pub.gotoHome(SITE);
            await expect(pub.homeBlock()).toHaveCount(1);
            await expect(pub.homeHeading()).toHaveText('Announcements');
            await expect(pub.homeFirst()).toContainText(SITE_TITLE_EDITED);
            await expect(pub.skipToAnnouncements()).toHaveText('Skip to announcements');
            await pub.gotoList(SITE);
            await pub.readMore(pub.summary(SITE_TITLE_EDITED)).click();
            await expect(visitor).toHaveURL(new RegExp(`/index/(en/)?announcement/view/${siteAnnouncement.id}$`));
            await expect(pub.heading()).toHaveText(SITE_TITLE_EDITED);
            await pub.gotoList(tag);
            await expect(pub.summary(NOTICE)).toHaveCount(1);
            await expect(pub.summary(SITE_TITLE_EDITED)).toHaveCount(0);
            await expect(visitor.getByText(SITE_TITLE_EDITED)).toHaveCount(0);
            // The scratch press's home page is not read here: on a press
            // with no "Display on Homepage" count it carries the site's
            // block while the site's announcements are on (T-omp-2, a
            // defect the suite stays silent on, PRINCIPLES M3).

            // No email: after the jobs, the mail catcher holds the press
            // announcement's email for the Site Administrator and none
            // titled "Site maintenance" (Actors row 6; Rule 16).
            runJobs();
            const control = {to: adminEmail, subject: NOTICE};
            await pkpMail.find(control);
            await pkpMail.expectNone({to: adminEmail, contains: SITE_TITLE, afterControl: control});

            // A site type: "Site news" is added with "Announcement type
            // added." (Rule 16).
            await site.openSideTab('types');
            const window = await types.openAdd();
            await window.nameInput('en').fill('Site news');
            await window.save();
            await expect(types.toast('Announcement type added.')).toBeVisible();
            await expect(types.row('Site news')).toHaveCount(1);

            // Deleted and switched off: the row deleted (and the type
            // removed, to leave the site as found), the box unticked and
            // saved: signed out, the site's Announcements page reads "404
            // Not Found" again and the home page has no block (Rules 2, 7,
            // 16).
            await site.openSideTab('items');
            await list.openDelete(SITE_TITLE_EDITED);
            await list.answerDelete('Yes');
            await expect(list.rows()).toHaveCount(0);
            await site.openSideTab('types');
            await types.openRemove('Site news');
            await types.answerRemove('OK');
            await expect(types.row('Site news')).toHaveCount(0);
            await site.openSideTab('settings');
            await form.enableBox().uncheck();
            await form.save();
            await pub.expectNotFound(PublicAnnouncements.listUrl(SITE));
            await pub.gotoHome(SITE);
            await expect(pub.skipLinks().first()).toHaveText('Skip to main content');
            await expect(pub.homeBlock()).toHaveCount(0);
        } finally {
            await restoreSite(adminPage).catch(() => {});
        }
    });
});
