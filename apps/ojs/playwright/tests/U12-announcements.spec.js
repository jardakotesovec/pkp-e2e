// @ts-check
/**
 * @file playwright/tests/U12-announcements.spec.js
 *
 * Announcements — OJS suite, one test per canonical scenario: S1, S2, S3,
 * S5 (common) and S7 (the announcement feed, OJS-specific) here; S4 (the
 * email, which drains the site's job queue) and S6 (the site's own
 * announcements, a fleet-global setting) in
 * playwright/tests/serial/U12-announcements.spec.js.
 * Spec: docs/specs/U12-announcements.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 🐞
 * (S3 asserts the remove dialog's sentence and the announcement gone with
 * its type, never that the dialog says nothing of it), A2 🐞, A3 🐞 (every
 * picture is a lower-case .png; the short date format stays YYYY-MM-DD),
 * A5 🐞 (S3 chooses a type and reads it chosen again, never that the
 * public pages print it nowhere), A6 ❓ (S3 presses no "none"), A7 🐞, A8 ❓
 * (no announcement is added while the box is unticked), A9 ❓ (no edit
 * ticks the email box), A10 🐞 (S1 reads the empty page's heading,
 * introduction and empty list, never the missing sentence), A11 🐞 (no
 * panel is closed unsaved), A12 🐞 (the deleted announcement's file is not
 * read), A13 🐞 (S3 reads the edited type's row after a reload, never the
 * stale row), A14 🐞 (an OMP/OPS mail), A15 🐞 (S7 reads the RSS 2.0 dates
 * as readable and asserts nothing of the Atom and RSS 1.0 dates), A16 🐞
 * (S7 reads the home page's feed box, never the Announcements page's
 * absence of one), OMP1 (a press). The spec's Coverage section records
 * everything else left out.
 *
 * Seeding: scenario endpoints only, through the context passthroughs
 * `enableAnnouncements`, `announcementsIntroduction`,
 * `numAnnouncementsHomepage`, `announcements[]`, `announcementTypes[]`,
 * `plugins` and `sidebar`, and `context.supportedFormLocales` for the second
 * form language (scenarios.md "POST scenarios/context"); no settings screen
 * is driven to reach a given. Every scenario runs on a scratch journal with
 * throwaway accounts (footnotes s1–s7): the seeded journal keeps
 * announcements off and no test changes it. Announcements seeded in one
 * request share a posted second (scenarios.md), so S3 finds rows by title
 * and S7 adds the newest by hand. The picture never loads on the test
 * installs (seed-facts): the suite asserts the `<img>` with its alternate
 * text and the stored file under the journal's public files directory,
 * never the rendered picture. Signed-out reads run in a second browser
 * context with an empty storage state (patterns.md, parallel lesson 8).
 * Feeds are read with the visitor's request context, because a page
 * navigation to XML downloads it. Waits are event-based (announcements API
 * responses, temporary-file uploads, the list's own fetch, web-first
 * assertions) — no hard-coded sleeps. Everything here runs in the parallel
 * `ojs` project.
 */
const fs = require('fs');
const path = require('path');
const {test, expect} = require('../support/fixtures.js');
const {
    AnnouncementsSettingsTab,
    SideMenu,
    AnnouncementsPage,
    PublicAnnouncements,
    AnnouncementView,
    homeBlock,
    gotoHome,
    expectNotFound,
    primaryNavItems,
    primaryNavItem,
    skipToAnnouncements,
    feedBlock,
    feedUrl,
    readFeed,
} = require('../pages/AnnouncementsPages.js');

const JOURNAL = 'publicknowledge';
const PNG = path.resolve(__dirname, '../fixtures/files/profile-image-400.png');
const REQUIRED = 'This field is required.';
const ACCESS_DENIED = 'The current role does not have access to this operation.';
const TYPE_REFUSED = "You can't upload files of this type.";
const DATE_REFUSED = 'The date format is not valid. Enter each date in the format YYYY-MM-DD.';
const SETTINGS_SENTENCE =
    'Announcements may be published to inform readers of journal news and events. Published announcements will appear on the Announcements page.';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u12${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for the scratch journal (users.md: `<username>@mail.test`). */
function account(tag, suffix, givenName, familyName, role) {
    return {username: `${tag}${suffix}`, givenName, familyName, email: `${tag}${suffix}@mail.test`, roles: [role]};
}

/** A signed-out browser context (no inherited storage state). */
async function signedOut(browser, baseURL) {
    return browser.newContext({baseURL, storageState: {cookies: [], origins: []}, reducedMotion: 'reduce'});
}

/** A calendar date as YYYY-MM-DD in the install's time zone (UTC on the test installs, footnote s2). */
function isoDate(offsetDays = 0) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}

/**
 * The journal's public announcements directory on disk (footnote s2:
 * `<public_files_dir>/journals/<id>/announcements`), read from the app's
 * test config the way the harness reads it.
 */
function announcementsDir(contextId) {
    const appRoot = process.env.PKP_APP_ROOT;
    const cfg = fs.readFileSync(path.join(appRoot, 'config.test.inc.php'), 'utf8');
    const m = cfg.match(/^public_files_dir\s*=\s*(.+)$/m);
    // Relative to the app root, as the app reads it (make-test-config.js).
    const pub = path.resolve(appRoot, m ? m[1].trim() : 'public');
    return path.join(pub, 'journals', String(contextId), 'announcements');
}

/** The access-denied page at `url`, as the signed-in `page`'s user. */
async function expectDenied(page, url) {
    await page.goto(url);
    await expect(page.getByText(ACCESS_DENIED, {exact: true})).toBeVisible({timeout: 30_000});
}

test.describe('announcements', () => {
    test('S1: switch announcements on', {tag: ['@smoke']}, async ({browser, baseURL, asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s1', testInfo);
        const manager = `${tag}mg`;
        const sectionEditor = `${tag}se`;
        const author = `${tag}au`;
        const reader = `${tag}rd`;
        await ojsApi.createContext({
            tag,
            users: [
                account(tag, 'mg', 'Mira', 'Manager', 'manager'),
                account(tag, 'se', 'Sara', 'Sectioneditor', 'sectionEditor'),
                account(tag, 'au', 'Ada', 'Author', 'author'),
                account(tag, 'rd', 'Rita', 'Reader', 'reader'),
            ],
        });
        const page = await (await asUser(manager)).newPage();
        const visitor = await (await signedOut(browser, baseURL)).newPage();
        const publicList = new PublicAnnouncements(visitor, tag);
        const home = homeBlock(visitor);

        // The public side while off: the Announcements page answers "404
        // Not Found"; the home page's header carries no "Announcements"
        // item ("Archives" is there, the positive read) (Rule 2).
        await expectNotFound(visitor, publicList.url());
        await gotoHome(visitor, tag);
        let items = await primaryNavItems(visitor);
        expect(items).toContain('Archives');
        expect(items).not.toContain('Announcements');

        // The side menu while off: no "Announcements" entry, "Settings"
        // there (Rule 2).
        await page.goto(`/index.php/${tag}/dashboard/editorial`);
        const menu = new SideMenu(page);
        let labels = await menu.topLevelLabels();
        expect(labels).toContain('Settings');
        expect(labels).not.toContain('Announcements');

        // The tab: the box unticked under its sentence and no other field;
        // ticked, "Introduction" and "Display on Homepage" appear (Fields).
        const settings = new AnnouncementsSettingsTab(page, tag);
        await settings.goto();
        await expect(settings.enableBox()).not.toBeChecked();
        await expect(settings.enableField()).toContainText(SETTINGS_SENTENCE);
        await expect(settings.panel.locator('.pkpFormField')).toHaveCount(1);
        await expect(settings.introductionField()).toHaveCount(0);
        await expect(settings.countField()).toHaveCount(0);
        await settings.enableBox().check();
        await expect(settings.introductionField()).toBeVisible();
        await expect(settings.label(settings.introductionField())).toHaveText(/^\s*Introduction\s*$/);
        await expect(settings.countField()).toBeVisible();
        await expect(settings.label(settings.countField())).toHaveText(/^\s*Display on Homepage\s*$/);
        await expect(settings.countField()).toContainText(
            'How many announcements to display on the homepage. Leave this empty to display none.'
        );
        await expect(settings.panel.locator('.pkpFormField')).toHaveCount(3);

        // A refused count: "abc" is not an integer, "-1" is below zero;
        // between the two "Save" comes back to life (Fields).
        await settings.countInput().fill('abc');
        await settings.saveRefused('Please correct one error.');
        await expect(settings.fieldError(settings.countField())).toHaveText('This is not a valid integer.');
        await expect(settings.errorSummary()).toContainText('Jump to next error');
        await settings.countInput().fill('-1');
        await expect(settings.saveButton()).toBeEnabled();
        await settings.saveRefused('Please correct one error.');
        await expect(settings.fieldError(settings.countField())).toHaveText('This must be at least 0.');

        // Saved: the side menu gains "Announcements" between "DOIs" and
        // "Settings" with no reload; after a reload it sits above "DOIs"
        // (Rules 2, 3).
        await settings.typeIntroduction('News from the editors.');
        await settings.countInput().fill('2');
        await expect(settings.saveButton()).toBeEnabled();
        await settings.save();
        await expect(menu.announcementsEntry()).toBeVisible();
        labels = await menu.topLevelLabels();
        expect(labels.indexOf('Announcements')).toBeGreaterThan(labels.indexOf('DOIs'));
        expect(labels.indexOf('Announcements')).toBeLessThan(labels.indexOf('Settings'));
        await page.reload();
        await expect(menu.announcementsEntry()).toBeVisible();
        labels = await menu.topLevelLabels();
        expect(labels.indexOf('Announcements')).toBeGreaterThanOrEqual(0);
        expect(labels.indexOf('Announcements')).toBeLessThan(labels.indexOf('DOIs'));

        // The public side on: the header carries "Announcements" after
        // "Archives"; pressed, the Announcements page opens with its
        // breadcrumb, heading and the introduction, then an empty list; the
        // home page carries no block (Rules 2, 9, 11, 12).
        await gotoHome(visitor, tag);
        items = await primaryNavItems(visitor);
        expect(items.indexOf('Announcements')).toBe(items.indexOf('Archives') + 1);
        await expect(home.section).toHaveCount(0);
        await expect(skipToAnnouncements(visitor)).toHaveCount(0);
        await primaryNavItem(visitor, 'Announcements').click();
        await expect(publicList.heading()).toHaveText('Announcements');
        await expect(visitor).toHaveURL(/\/announcement$/);
        await expect(publicList.breadcrumb()).toHaveText(/^\s*Home\s*\/\s*Announcements\s*$/);
        await expect(publicList.container()).toContainText('News from the editors.');
        await expect(publicList.list()).toHaveCount(1);
        await expect(publicList.articles()).toHaveCount(0);
        await expect(publicList.editLink()).toHaveCount(0);

        // The "Edit" link: as the manager the public page carries "Edit"
        // (read as "Edit Announcements" too); pressed, the journal's
        // Announcements page opens on its "Announcements" tab, empty
        // (Actors row 5; Rules 3, 4).
        const managerList = new PublicAnnouncements(page, tag);
        await managerList.goto();
        await expect(managerList.editLink()).toBeVisible();
        await expect(managerList.editLink()).toContainText('Edit');
        await expect(managerList.editLink().locator('.pkp_screen_reader')).toHaveText('Edit Announcements');
        await managerList.editLink().click();
        const admin = new AnnouncementsPage(page, tag);
        await expect(admin.heading()).toHaveText('Announcements');
        await expect(page).toHaveURL(/management\/settings\/announcements/);
        await expect(admin.tab('Announcements')).toHaveAttribute('aria-selected', 'true');
        await expect(admin.tab('Announcement Types')).toBeVisible();
        await expect(admin.list().emptyMessage()).toBeVisible();
        await expect(admin.list().rows()).toHaveCount(0);

        // Control: the Section Editor, the Author and the Reader each get
        // the access-denied page at both addresses and have no
        // "Announcements" in their side menu (Actors rows 1–2); the
        // manager's own reads above are the positive control.
        const dashboards = {
            [sectionEditor]: `/index.php/${tag}/dashboard/editorial`,
            [author]: `/index.php/${tag}/dashboard/mySubmissions`,
            [reader]: `/index.php/${tag}/user/profile`,
        };
        for (const username of [sectionEditor, author, reader]) {
            const other = await (await asUser(username)).newPage();
            await expectDenied(other, `/index.php/${tag}/en/management/settings/website`);
            await expect(other.locator('#setup-button')).toHaveCount(0);
            await expectDenied(other, `/index.php/${tag}/en/management/settings/announcements`);
            await expect(other.locator('main .listPanel')).toHaveCount(0);
            await other.goto(dashboards[username]);
            const otherMenu = new SideMenu(other);
            const otherLabels = await otherMenu.topLevelLabels();
            expect(otherLabels.length, `${username}'s side menu has entries`).toBeGreaterThan(0);
            expect(otherLabels).not.toContain('Announcements');
            await other.close();
        }
    });

    test('S2: add, edit and delete an announcement', async ({browser, baseURL, asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(360_000);
        const tag = makeTag('s2', testInfo);
        const manager = `${tag}mg`;
        const journalName = `Scratch context ${tag}`;
        const {contextId} = await ojsApi.createContext({
            tag,
            enableAnnouncements: true,
            numAnnouncementsHomepage: 2,
            users: [account(tag, 'mg', 'Mira', 'Manager', 'manager')],
        });
        const page = await (await asUser(manager)).newPage();
        const visitor = await (await signedOut(browser, baseURL)).newPage();
        const admin = new AnnouncementsPage(page, tag);
        const list = admin.list();
        const publicList = new PublicAnnouncements(visitor, tag);
        const view = new AnnouncementView(visitor, tag);
        const home = homeBlock(visitor);
        const today = isoDate(0);
        const tomorrow = isoDate(1);

        // The empty list: "No items found." with "Search" and "Add
        // Announcement" above it, reached from the side menu (Rules 3, 4).
        await page.goto(`/index.php/${tag}/dashboard/editorial`);
        await new SideMenu(page).announcementsEntry().click();
        await expect(admin.heading()).toHaveText('Announcements');
        await expect(page).toHaveURL(/management\/settings\/announcements/);
        await expect(list.emptyMessage()).toBeVisible();
        await expect(list.rows()).toHaveCount(0);
        await expect(list.searchBox()).toBeVisible();
        await expect(list.addButton()).toBeVisible();

        // An empty save: the panel's fields, the email box unticked, no
        // "Announcement Type"; "Save" is refused in place with the summary,
        // its "Go to Title" button, "Jump to next error" and the message
        // under "Title" (Fields; Rule 13).
        let panel = await list.openAdd();
        await expect(panel.label(panel.titleField())).toHaveText(/^\s*Title\s*$/);
        await expect(panel.shortDescriptionField()).toContainText('A brief description to appear along with the announcement title.');
        await expect(panel.announcementField()).toContainText('The full text of the announcement.');
        await expect(panel.imageField()).toBeVisible();
        await expect(panel.label(panel.imageField())).toHaveText(/^\s*Image\s*$/);
        await expect(panel.expiryField()).toContainText(
            'The announcement will be displayed to readers until this date. Leave blank if the announcement should be displayed indefinitely.'
        );
        await expect(panel.sendEmailBox()).toBeVisible();
        await expect(panel.sendEmailBox()).not.toBeChecked();
        await expect(panel.typeField()).toHaveCount(0);
        await panel.saveRefused('Please correct one error.');
        await expect(panel.errorLink(`Go to Title: ${REQUIRED}`)).toBeVisible();
        await expect(panel.errorSummary().getByRole('button', {name: 'Jump to next error', exact: true})).toBeVisible();
        await expect(panel.fieldError(panel.titleField())).toHaveText(REQUIRED);
        await expect(panel.fieldError(panel.expiryField())).toHaveCount(0);

        // A refused date and a refused file: "tomorrow" is not a date; a
        // text file is listed in the box with the sentence and "REMOVE
        // FILE", counted as a form error with "Save" and "Upload File"
        // grayed out; removed, "Save" is live (Fields).
        await panel.titleInput().fill('Call for papers');
        await panel.expiryInput().fill('tomorrow');
        await panel.saveRefused('Please correct one error.');
        await expect(panel.fieldError(panel.expiryField())).toHaveText(DATE_REFUSED);
        await expect(panel.fieldError(panel.titleField())).toHaveCount(0);
        await panel.expiryInput().fill('');
        const notes = testInfo.outputPath('notes.txt');
        fs.writeFileSync(notes, 'Not a picture.\n');
        const uploads = [];
        page.on('request', (r) => {
            if (/temporaryFiles/.test(r.url())) uploads.push(r.url());
        });
        await panel.fileInput().setInputFiles(notes);
        await expect(panel.refusedFile()).toContainText('notes.txt');
        await expect(panel.removeFileLink()).toBeVisible();
        await expect(panel.dropzoneError()).toHaveText(TYPE_REFUSED);
        await expect(panel.errorSummary()).toContainText('Please correct one error.');
        await expect(panel.saveButton()).toBeDisabled();
        await expect(panel.uploadFileButton()).toBeDisabled();
        await panel.removeFileLink().click();
        await expect(panel.refusedFile()).toHaveCount(0);
        await expect(panel.dropzoneError()).toHaveCount(0);
        await expect(panel.saveButton()).toBeEnabled();
        expect(uploads, 'the refused text file sent nothing').toHaveLength(0);

        // The first announcement, with a picture: the PNG shows a preview
        // with "Alternate text"; saved, "Call for papers" is the only row
        // with "View", "Edit" and "Delete" alone (Rule 5).
        await panel.typeShortDescription('Deadline 1 June.');
        await panel.typeAnnouncement('Submissions are open until 1 June.');
        await panel.uploadImage(PNG);
        expect(uploads, 'the PNG is the one upload').toHaveLength(1);
        await expect(panel.altTextInput()).toBeVisible();
        await panel.altTextInput().fill('Journal logo');
        await expect(panel.sendEmailBox()).not.toBeChecked();
        await panel.save();
        await expect(list.rows()).toHaveCount(1);
        await expect(list.row('Call for papers')).toBeVisible();
        await expect(list.emptyMessage()).toHaveCount(0);
        await expect(list.row('Call for papers').getByRole('link')).toHaveCount(1);
        await expect(list.viewLink('Call for papers')).toBeVisible();
        await expect(list.row('Call for papers').getByRole('button')).toHaveCount(2);
        await expect(list.editButton('Call for papers')).toBeVisible();
        await expect(list.deleteButton('Call for papers')).toBeVisible();
        const callId = await list.idOf('Call for papers');

        // The public pages, signed out: the summary with its picture,
        // title link, today's date, short description and "Read More"; the
        // home page block with the same summary and its skip link; the
        // announcement's page with breadcrumb, heading, date, the picture
        // above the text, the browser title and no other control (Rules 5,
        // 9, 10, 11).
        await publicList.goto();
        await expect(publicList.articles()).toHaveCount(1);
        let summary = publicList.summary('Call for papers');
        await expect(summary.image).toHaveAttribute('alt', 'Journal logo');
        await expect(summary.titleLink).toHaveText('Call for papers');
        await expect(summary.titleLink).toHaveAttribute('href', new RegExp(`/announcement/view/${callId}$`));
        await expect(summary.date).toHaveText(today);
        await expect(summary.summary).toContainText('Deadline 1 June.');
        await expect(summary.readMoreVisible).toHaveText('Read More');
        await expect(summary.readMoreScreenReader).toHaveText('Read more about Call for papers');
        const storedImage = path.join(announcementsDir(contextId), `${callId}.png`);
        expect(fs.existsSync(storedImage), `the picture is stored at ${storedImage}`).toBe(true);
        await gotoHome(visitor, tag);
        await expect(home.section).toBeVisible();
        await expect(home.heading).toHaveText('Announcements');
        await expect(home.articles).toHaveCount(1);
        await expect(home.first.titleLink).toHaveText('Call for papers');
        await expect(home.first.image).toHaveAttribute('alt', 'Journal logo');
        await expect(home.first.date).toHaveText(today);
        await expect(home.first.summary).toContainText('Deadline 1 June.');
        await expect(home.first.readMore).toBeVisible();
        await expect(skipToAnnouncements(visitor)).toHaveText('Skip to announcements');
        await home.first.readMore.click();
        await expect(view.heading()).toHaveText('Call for papers');
        await expect(visitor).toHaveURL(new RegExp(`/announcement/view/${callId}$`));
        await expect(view.breadcrumb()).toHaveText(/^\s*Home\s*\/\s*Announcements\s*\/\s*Call for papers\s*$/);
        await expect(view.date()).toHaveText(today);
        await expect(view.image()).toHaveAttribute('alt', 'Journal logo');
        await expect(view.description()).toContainText('Submissions are open until 1 June.');
        expect(await view.article().locator('img, .description').evaluateAll((els) => els.map((e) => e.className))).toEqual([
            'obj_announcement_full_image',
            'description',
        ]);
        await expect(visitor).toHaveTitle(`Call for papers | ${journalName}`);
        await expect(view.links()).toHaveCount(2);
        await expect(view.container().locator('button, input, select')).toHaveCount(0);

        // "View": the announcement's page opens in the same window (Rule 4).
        await list.viewLink('Call for papers').click();
        await expect(page).toHaveURL(new RegExp(`/announcement/view/${callId}$`));
        await expect(new AnnouncementView(page, tag).heading()).toHaveText('Call for papers');
        await admin.goto();

        // The second announcement, short description only, expiring
        // tomorrow: "Workshop" is the first row; signed out it is listed
        // first, its page shows the short description as its text, and the
        // home page block shows it as a full summary with "Call for papers"
        // under it as a title link with its date (Rules 4, 5, 10, 11).
        panel = await list.openAdd();
        await panel.titleInput().fill('Workshop');
        await panel.typeShortDescription('Registration open.');
        await panel.expiryInput().fill(tomorrow);
        await panel.save();
        await expect(list.rows()).toHaveCount(2);
        await expect.poll(() => list.rowTitles()).toEqual(['Workshop', 'Call for papers']);
        const workshopId = await list.idOf('Workshop');
        await publicList.goto();
        expect(await publicList.titles()).toEqual(['Workshop', 'Call for papers']);
        await view.goto(workshopId);
        await expect(view.heading()).toHaveText('Workshop');
        await expect(view.description()).toHaveText('Registration open.');
        await expect(view.image()).toHaveCount(0);
        await gotoHome(visitor, tag);
        await expect(home.articles).toHaveCount(2);
        await expect(home.first.titleLink).toHaveText('Workshop');
        await expect(home.first.summary).toContainText('Registration open.');
        await expect(home.first.readMore).toBeVisible();
        await expect(home.more).toHaveCount(1);
        expect(await home.moreTitles()).toEqual(['Call for papers']);
        await expect(home.moreDates.first()).toHaveText(today);
        await expect(home.more.first().locator('.summary')).toHaveCount(0);

        // Edit: the panel opens with the row's values and tomorrow's date;
        // a new title saves in place, still first; signed out the same
        // (Rule 6).
        panel = await list.openEdit('Workshop');
        await expect(panel.titleInput()).toHaveValue('Workshop');
        expect(await panel.richText(panel.shortDescriptionField())).toBe('Registration open.');
        await expect(panel.expiryInput()).toHaveValue(tomorrow);
        await panel.titleInput().fill('Workshop 2027');
        await panel.save();
        await expect(list.rows()).toHaveCount(2);
        await expect.poll(() => list.rowTitles()).toEqual(['Workshop 2027', 'Call for papers']);
        await publicList.goto();
        expect(await publicList.titles()).toEqual(['Workshop 2027', 'Call for papers']);

        // Expired: today's date as the expiry keeps the row and takes the
        // announcement off the public pages; its address, an unknown one
        // and the row's "View" land on the Announcements page (Rules 4, 8,
        // 10, 11).
        panel = await list.openEdit('Workshop 2027');
        await panel.expiryInput().fill(today);
        await panel.save();
        await expect(list.rows()).toHaveCount(2);
        await expect(list.row('Workshop 2027')).toBeVisible();
        await publicList.goto();
        expect(await publicList.titles()).toEqual(['Call for papers']);
        await gotoHome(visitor, tag);
        await expect(home.articles).toHaveCount(1);
        await expect(home.first.titleLink).toHaveText('Call for papers');
        await expect(home.first.summary).toContainText('Deadline 1 June.');
        await expect(home.more).toHaveCount(0);
        await view.goto(workshopId);
        await expect(visitor).toHaveURL(/\/announcement$/);
        await expect(publicList.heading()).toHaveText('Announcements');
        await expect(view.container()).toHaveCount(0);
        expect(await publicList.titles()).toEqual(['Call for papers']);
        await view.goto(999999);
        await expect(visitor).toHaveURL(/\/announcement$/);
        await expect(publicList.heading()).toHaveText('Announcements');
        await list.viewLink('Workshop 2027').click();
        await expect(page).toHaveURL(/\/announcement$/);
        await expect(new PublicAnnouncements(page, tag).heading()).toHaveText('Announcements');
        await admin.goto();

        // Back from expiry: the date cleared, "Workshop 2027" is listed
        // first again (Rule 8).
        panel = await list.openEdit('Workshop 2027');
        await expect(panel.expiryInput()).toHaveValue(today);
        await panel.expiryInput().fill('');
        await panel.save();
        await publicList.goto();
        expect(await publicList.titles()).toEqual(['Workshop 2027', 'Call for papers']);

        // The picture removed: the preview with "Remove"; "Restore Original"
        // is offered once "Remove" is pressed and brings the preview back
        // (T-ojs-1: the panel opens with "Remove" alone, run 2026-09-17);
        // "Remove" then "Save" leaves the page and the summaries text-only
        // and deletes the file (Fields "Image"; Rule 15).
        panel = await list.openEdit('Call for papers');
        await expect(panel.preview()).toBeVisible();
        await expect(panel.altTextInput()).toHaveValue('Journal logo');
        await expect(panel.removeButton()).toBeVisible();
        await expect(panel.restoreButton()).toHaveCount(0);
        await panel.removeButton().click();
        await expect(panel.preview()).toHaveCount(0);
        await expect(panel.restoreButton()).toBeVisible();
        await panel.restoreButton().click();
        await expect(panel.preview()).toBeVisible();
        await expect(panel.altTextInput()).toHaveValue('Journal logo');
        await panel.removeButton().click();
        await expect(panel.preview()).toHaveCount(0);
        await panel.save();
        await view.goto(callId);
        await expect(view.heading()).toHaveText('Call for papers');
        await expect(view.image()).toHaveCount(0);
        await expect(view.description()).toContainText('Submissions are open until 1 June.');
        await publicList.goto();
        summary = publicList.summary('Call for papers');
        await expect(summary.titleLink).toBeVisible();
        await expect(summary.image).toHaveCount(0);
        await expect(publicList.summary('Workshop 2027').image).toHaveCount(0);
        await gotoHome(visitor, tag);
        await expect(home.articles).toHaveCount(2);
        await expect(home.section.locator('img')).toHaveCount(0);
        expect(fs.existsSync(storedImage), 'the removed picture is gone from the public files').toBe(false);

        // Delete: the dialog's sentence with "Yes" and "No"; "No" keeps the
        // row; "Yes" removes it, its address lands on the Announcements
        // page and, signed out, "Call for papers" is alone (Rule 7).
        await list.deleteButton('Workshop 2027').click();
        await expect(list.deleteDialog()).toBeVisible();
        await expect(list.deleteDialog()).toContainText(
            'Are you sure you want to permanently delete the announcement Workshop 2027?'
        );
        await expect(list.deleteDialog().getByRole('button', {name: 'Yes', exact: true})).toBeVisible();
        await list.deleteDialog().getByRole('button', {name: 'No', exact: true}).click();
        await expect(list.deleteDialog()).toHaveCount(0);
        await expect(list.rows()).toHaveCount(2);
        await expect(list.row('Workshop 2027')).toBeVisible();
        await list.deleteAnnouncement('Workshop 2027');
        await expect(list.rows()).toHaveCount(1);
        await expect(list.row('Call for papers')).toBeVisible();
        await view.goto(workshopId);
        await expect(visitor).toHaveURL(/\/announcement$/);
        await expect(publicList.heading()).toHaveText('Announcements');
        expect(await publicList.titles()).toEqual(['Call for papers']);

        // Control: the seeded journal's Announcements page still answers
        // "404 Not Found": nothing of the scratch journal's reaches it
        // (Rules 1, 2).
        await expectNotFound(visitor, `/index.php/${JOURNAL}/en/announcement`);
    });

    test('S3: search the list; add, edit and remove announcement types', async ({browser, baseURL, asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s3', testInfo);
        const manager = `${tag}mg`;
        const seeded = await ojsApi.createContext({
            tag,
            enableAnnouncements: true,
            numAnnouncementsHomepage: 2,
            announcements: [
                {title: 'Call for papers', descriptionShort: '<p>Deadline 1 June.</p>'},
                {title: 'Workshop', descriptionShort: '<p>Registration open.</p>'},
                {title: 'Reading group', description: '<p>Meets monthly.</p>'},
            ],
            users: [account(tag, 'mg', 'Mira', 'Manager', 'manager')],
        });
        const workshopId = seeded.announcements.find((a) => a.title === 'Workshop').id;
        const page = await (await asUser(manager)).newPage();
        const visitor = await (await signedOut(browser, baseURL)).newPage();
        const admin = new AnnouncementsPage(page, tag);
        const list = admin.list();
        const publicList = new PublicAnnouncements(visitor, tag);
        const view = new AnnouncementView(visitor, tag);
        const home = homeBlock(visitor);

        // "Search": one word in the title, one in the short description,
        // the two together across texts, then the box cleared (Rule 4).
        await admin.goto();
        await expect(list.rows()).toHaveCount(3);
        await list.search('call');
        await expect(list.rows()).toHaveCount(1);
        await expect.poll(() => list.rowTitles()).toEqual(['Call for papers']);
        await list.search('june');
        await expect(list.rows()).toHaveCount(1);
        await expect.poll(() => list.rowTitles()).toEqual(['Call for papers']);
        await list.search('june call');
        await expect(list.emptyMessage()).toBeVisible();
        await expect(list.rows()).toHaveCount(0);
        await list.search('');
        await expect(list.rows()).toHaveCount(3);
        expect((await list.rowTitles()).sort()).toEqual(['Call for papers', 'Reading group', 'Workshop']);

        // The empty types table: headed "Announcement Types" with its
        // "Name" column, reading "No announcement types have been
        // created.", "Add Announcement Type" above it (Rule 13).
        await admin.openTypesTab();
        const types = admin.types();
        await expect(types.grid).toContainText('Announcement Types');
        await expect(types.grid.getByRole('columnheader', {name: 'Name', exact: true})).toBeVisible();
        await expect(types.emptyMessage()).toBeVisible();
        await expect(types.rows()).toHaveCount(0);
        await expect(types.addLink()).toBeVisible();

        // A refused name: the window with "Name", "Save" and "Cancel";
        // "Save" with "Name" empty is refused under "Name" and the window
        // stays open (Fields).
        await types.openAdd();
        await expect(types.windowSaveButton()).toBeVisible();
        await expect(types.windowCancelLink()).toBeVisible();
        await types.windowSaveButton().click();
        await expect(types.nameError()).toBeVisible();
        await expect(types.nameInput('en')).toBeVisible();

        // Two types added: the toast and the row, twice (Rule 13).
        await types.nameInput('en').fill('Conference');
        await types.save();
        await expect(types.toast('Announcement type added.')).toBeVisible();
        await expect(types.row('Conference')).toHaveCount(1);
        // The legacy grid keeps its empty row in the DOM, hidden, once a row exists.
        await expect(types.emptyMessage()).toBeHidden();
        await types.openAdd();
        await types.nameInput('en').fill('Event');
        await types.save();
        await expect(types.toast('Announcement type added.')).toBeVisible();
        await expect(types.row('Event')).toHaveCount(1);
        await expect.poll(() => types.rowNames()).toEqual(['Conference', 'Event']);

        // A type edited: the arrow, "Edit", the same window; saved, the
        // toast; the row reads the new name once the page is reloaded
        // (Rule 13; A13's stale row is not asserted).
        await types.openEdit('Conference');
        await types.nameInput('en').fill('Conference 2027');
        await types.save();
        await expect(types.toast('Announcement type edited.')).toBeVisible();
        await admin.goto();
        await admin.openTypesTab();
        await expect.poll(() => admin.types().rowNames()).toEqual(['Conference 2027', 'Event']);

        // A typed announcement: the panel now offers "Announcement Type"
        // with the two round buttons, none chosen; "Event" chosen and
        // saved is chosen again on the next edit (Fields; Rule 13).
        await admin.openAnnouncementsTab();
        let panel = await list.openEdit('Workshop');
        await expect(panel.typeField()).toBeVisible();
        // The radio group's caption is a legend, not a field label.
        await expect(panel.typeField().locator('legend, .pkpFormFieldLabel').first()).toHaveText(/^\s*Announcement Type\s*$/);
        await expect(panel.typeRadios()).toHaveCount(2);
        await expect(panel.typeRadio('Conference 2027')).toBeVisible();
        await expect(panel.typeRadio('Event')).toBeVisible();
        await expect(panel.typeRadios().filter({has: page.locator(':checked')})).toHaveCount(0);
        await expect(panel.typeRadio('Conference 2027')).not.toBeChecked();
        await expect(panel.typeRadio('Event')).not.toBeChecked();
        await panel.typeRadio('Event').check();
        await panel.save();
        panel = await list.openEdit('Workshop');
        await expect(panel.typeRadio('Event')).toBeChecked();
        await expect(panel.typeRadio('Conference 2027')).not.toBeChecked();
        await panel.close();
        await publicList.goto();
        await expect(publicList.summary('Workshop').titleLink).toBeVisible();
        await view.goto(workshopId);
        await expect(view.heading()).toHaveText('Workshop');

        // A type removed with its announcement: the confirm's sentence
        // with "OK" and "Cancel"; "OK" removes the type with its toast, and
        // "Workshop" is gone from the public pages; the "Announcements"
        // tab's list still shows it until the page is reloaded, then two
        // rows remain (Rule 13; Side effects).
        await admin.openTypesTab();
        const typesAgain = admin.types();
        await typesAgain.openRemove('Event');
        await expect(typesAgain.confirmDialog()).toContainText('Are you sure you wish to delete this item? This action cannot be undone.');
        await expect(typesAgain.confirmDialog().getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        await typesAgain.confirmDialog().getByRole('button', {name: 'OK', exact: true}).click();
        await expect(typesAgain.toast('Announcement type removed.')).toBeVisible();
        await expect(typesAgain.row('Event')).toHaveCount(0);
        await expect.poll(() => typesAgain.rowNames()).toEqual(['Conference 2027']);
        await publicList.goto();
        expect((await publicList.titles()).sort()).toEqual(['Call for papers', 'Reading group']);
        await gotoHome(visitor, tag);
        await expect(home.articles).toHaveCount(2);
        await expect(home.section).not.toContainText('Workshop');
        await view.goto(workshopId);
        await expect(visitor).toHaveURL(/\/announcement$/);
        await expect(publicList.heading()).toHaveText('Announcements');
        await admin.openAnnouncementsTab();
        await expect(list.rows()).toHaveCount(3);
        await expect(list.row('Workshop')).toBeVisible();
        await admin.goto();
        await expect(list.rows()).toHaveCount(2);
        await expect(list.row('Workshop')).toHaveCount(0);

        // Control: the two untyped announcements are still listed and,
        // signed out, still on the Announcements page (Rule 13).
        await expect(list.row('Call for papers')).toBeVisible();
        await expect(list.row('Reading group')).toBeVisible();
        await publicList.goto();
        await expect(publicList.summary('Call for papers').titleLink).toBeVisible();
        await expect(publicList.summary('Reading group').titleLink).toBeVisible();
        await expect(publicList.articles()).toHaveCount(2);
    });

    test('S5: announcements in a second language', async ({browser, baseURL, asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s5', testInfo);
        const manager = `${tag}mg`;
        await ojsApi.createContext({
            tag,
            context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            enableAnnouncements: true,
            numAnnouncementsHomepage: 2,
            announcements: [{title: 'Call for papers', descriptionShort: '<p>Deadline 1 June.</p>'}],
            users: [account(tag, 'mg', 'Mira', 'Manager', 'manager')],
        });
        const page = await (await asUser(manager)).newPage();
        const visitor = await (await signedOut(browser, baseURL)).newPage();
        const admin = new AnnouncementsPage(page, tag);
        const list = admin.list();
        const publicList = new PublicAnnouncements(visitor, tag);
        const home = homeBlock(visitor);

        // The two-language panel: the language button shows the French
        // boxes, labelled "{Field} in French" (Fields; Rule 14).
        await admin.goto();
        await expect(list.rows()).toHaveCount(1);
        let panel = await list.openAdd();
        await expect(panel.titleInput('fr_CA')).toBeHidden();
        await panel.localeButton('French').click();
        await expect(panel.titleInput('fr_CA')).toBeVisible();
        await expect(panel.label(panel.titleField('fr_CA'))).toContainText('Title in French');
        await expect(panel.label(panel.shortDescriptionField('fr_CA'))).toContainText('Short Description in French');
        await expect(panel.label(panel.announcementField('fr_CA'))).toContainText('Announcement in French');

        // A French-only save refused: the summary and the message under
        // "Title" (Fields "Title"; Rule 14).
        await panel.titleInput('fr_CA').fill('Appel à contributions');
        await expect(panel.titleInput('en')).toHaveValue('');
        await panel.saveRefused('Please correct one error.');
        await expect(panel.fieldError(panel.titleField('en'))).toHaveText(REQUIRED);
        await expect(panel.fieldError(panel.titleField('fr_CA'))).toHaveCount(0);

        // Saved in both languages: "Second call" is the first row (Rules 5, 14).
        await panel.titleInput('en').fill('Second call');
        await panel.typeShortDescription('Date limite le 1er juin.', 'fr_CA');
        await expect(panel.saveButton()).toBeEnabled();
        await panel.save();
        await expect(list.rows()).toHaveCount(2);
        await expect.poll(() => list.rowTitles()).toEqual(['Second call', 'Call for papers']);

        // The list and the pages in French: the French title where there
        // is one, the primary-language title otherwise (Rule 14).
        await admin.goto({locale: 'fr_CA'});
        await expect(list.rows()).toHaveCount(2);
        await expect.poll(() => list.rowTitles()).toEqual(['Appel à contributions', 'Call for papers']);
        await publicList.goto('fr_CA');
        expect(await publicList.titles()).toEqual(['Appel à contributions', 'Call for papers']);
        await expect(publicList.summary('Appel à contributions').summary).toContainText('Date limite le 1er juin.');
        await expect(publicList.summary('Call for papers').summary).toContainText('Deadline 1 June.');
        await gotoHome(visitor, tag, 'fr_CA');
        await expect(home.articles).toHaveCount(2);
        await expect(home.first.titleLink).toHaveText('Appel à contributions');
        await expect(home.first.summary).toContainText('Date limite le 1er juin.');
        expect(await home.moreTitles()).toEqual(['Call for papers']);

        // An edit emptying the primary language is refused with "You must
        // complete this field in English." under "Title" (Fields "Title").
        await admin.goto({locale: 'en'});
        panel = await list.openEdit('Second call');
        await expect(panel.titleInput('en')).toHaveValue('Second call');
        await panel.titleInput('en').fill('');
        await panel.saveRefused('Please correct one error.');
        await expect(panel.fieldError(panel.titleField('en'))).toHaveText('You must complete this field in English.');
        await panel.close();

        // A type in two languages: "Name" in English and in French; the
        // French box alone is refused, the English one saves (Fields; Rule 13).
        await admin.openTypesTab();
        const types = admin.types();
        await types.openAdd();
        await expect(types.nameInput('en')).toBeVisible();
        await types.nameInput('en').focus();
        await expect(types.nameInput('fr_CA')).toBeVisible();
        await types.nameInput('fr_CA').fill('Conférence');
        await types.windowSaveButton().click();
        await expect(types.nameError()).toBeVisible();
        await expect(types.row('Conference')).toHaveCount(0);
        await types.nameInput('en').fill('Conference');
        await types.save();
        await expect(types.toast('Announcement type added.')).toBeVisible();
        await expect(types.row('Conference')).toHaveCount(1);

        // Control: signed out, the English page lists both with the
        // English text under "Call for papers" (Rule 14).
        await publicList.goto('en');
        expect(await publicList.titles()).toEqual(['Second call', 'Call for papers']);
        await expect(publicList.summary('Call for papers').summary).toContainText('Deadline 1 June.');
        // What the English page prints under "Second call", which has no
        // English short description, is not the scenario's (T-ojs-2).
    });

    test('S7: the announcement feed', async ({browser, baseURL, asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s7', testInfo);
        const manager = `${tag}mg`;
        const journalName = `Scratch context ${tag}`;
        const seeded = await ojsApi.createContext({
            tag,
            enableAnnouncements: true,
            plugins: {announcementfeedplugin: {enabled: true}},
            sidebar: ['AnnouncementFeedBlockPlugin'],
            announcements: [
                {title: 'Older notice', description: '<p>Posted first.</p>'},
                {title: 'Old news', descriptionShort: '<p>Long gone.</p>', dateExpire: '2020-01-01'},
            ],
            users: [account(tag, 'mg', 'Mira', 'Manager', 'manager')],
        });
        const olderId = seeded.announcements.find((a) => a.title === 'Older notice').id;
        const page = await (await asUser(manager)).newPage();
        const visitor = await (await signedOut(browser, baseURL)).newPage();
        const admin = new AnnouncementsPage(page, tag);
        const list = admin.list();

        // The newest by hand: "Newer notice" is the first row (Rule 5).
        await admin.goto();
        await expect(list.rows()).toHaveCount(2);
        const panel = await list.openAdd();
        await panel.titleInput().fill('Newer notice');
        await panel.typeAnnouncement('Posted second.');
        await panel.save();
        await expect(list.rows()).toHaveCount(3);
        expect((await list.rowTitles())[0]).toBe('Newer notice');
        const newerId = await list.idOf('Newer notice');

        // The box: signed out, the home page's sidebar carries a box headed
        // "Announcements" with the three logo links (Rule 18).
        await gotoHome(visitor, tag);
        const box = feedBlock(visitor);
        await expect(box.block).toBeVisible();
        await expect(box.heading).toHaveText('Announcements');
        await expect(box.links).toHaveCount(3);
        const hrefs = {};
        for (const [alt, type] of [
            ['Atom logo', 'atom'],
            ['RSS2 logo', 'rss2'],
            ['RSS1 logo', 'rss'],
        ]) {
            await expect(box.link(alt)).toHaveCount(1);
            const href = await box.link(alt).getAttribute('href');
            expect(href, `the ${alt} link's address`).toMatch(new RegExp(`${feedUrl(tag, type)}$`));
            hrefs[type] = href;
        }

        // The feeds: each titled "{journal name}: Announcements", listing
        // "Older notice" then "Newer notice", oldest first, with title,
        // date, page address and "Announcement" text; "Old news" in none;
        // the RSS 2.0 dates readable (Rules 8, 18).
        for (const type of ['atom', 'rss2', 'rss']) {
            const feed = await readFeed(visitor.request, hrefs[type]);
            expect(feed.status, `${type} answers`).toBe(200);
            expect(feed.contentType, `${type} is XML`).toMatch(/xml/);
            expect(feed.title, `${type}'s title`).toBe(`${journalName}: Announcements`);
            expect(feed.entries.map((e) => e.title), `${type}'s entries`).toEqual(['Older notice', 'Newer notice']);
            expect(feed.entries[0].link).toMatch(new RegExp(`/${tag}/announcement/view/${olderId}$`));
            expect(feed.entries[1].link).toMatch(new RegExp(`/${tag}/announcement/view/${newerId}$`));
            expect(feed.entries[0].description).toContain('Posted first.');
            expect(feed.entries[1].description).toContain('Posted second.');
            for (const entry of feed.entries) {
                expect(entry.date, `${type}'s "${entry.title}" carries a date`).not.toBe('');
            }
            expect(feed.body).not.toContain('Old news');
        }
        const rss2 = await readFeed(visitor.request, hrefs.rss2);
        for (const entry of rss2.entries) {
            expect(entry.date, `RSS 2.0's "${entry.title}" date is readable`).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}$/);
        }

        // Announcements switched off: each feed address lands on the
        // journal's home page (Rules 2, 18).
        const settings = new AnnouncementsSettingsTab(page, tag);
        await settings.goto();
        await expect(settings.enableBox()).toBeChecked();
        await settings.enableBox().uncheck();
        await settings.save();
        for (const type of ['atom', 'rss2', 'rss']) {
            const response = await visitor.goto(hrefs[type]);
            expect(response && response.status(), `${type} with announcements off`).toBe(200);
            // The home page's own block (`.page_index_journal`) is empty
            // on a scratch journal, so the landmark is the main structure.
            await expect(visitor.locator('.pkp_structure_main')).toBeVisible();
            await expect(visitor.locator('.page_index_journal')).toHaveCount(1);
            await expect(visitor).toHaveTitle(journalName);
        }

        // Control: a second scratch journal with announcements on and the
        // plugin at its default, disabled: the three feed addresses read
        // "404 Not Found" and the "Sidebar" list offers no "Announcement
        // Feed Plugin" while it offers the other blocks (Rule 18; Settings).
        const control = `${tag}b`;
        await ojsApi.createContext({
            tag: control,
            enableAnnouncements: true,
            users: [account(control, 'mg', 'Mona', 'Manager', 'manager')],
        });
        for (const type of ['atom', 'rss2', 'rss']) {
            const feed = await readFeed(visitor.request, feedUrl(control, type));
            expect(feed.status, `${type} with the plugin disabled`).toBe(404);
            expect(feed.body).toContain('404 Not Found');
        }
        const controlPage = await (await asUser(`${control}mg`)).newPage();
        await controlPage.goto(`/index.php/${control}/en/management/settings/website`);
        const appearance = controlPage.locator('#appearance').first();
        await expect(controlPage.locator('#appearance-button').first()).toBeVisible();
        if ((await controlPage.locator('#appearance-button').first().getAttribute('aria-selected')) !== 'true') {
            await controlPage.locator('#appearance-button').first().click();
        }
        await appearance.getByRole('tab', {name: 'Setup', exact: true}).click();
        const sidebarField = appearance.locator('[role="tabpanel"]:visible .pkpFormField').filter({hasText: 'Sidebar'}).first();
        await expect(sidebarField).toBeVisible();
        await expect(sidebarField.locator('input[type=checkbox][value="informationblockplugin"]')).toHaveCount(1);
        await expect(sidebarField.locator('input[type=checkbox][value="AnnouncementFeedBlockPlugin"]')).toHaveCount(0);
        await expect(sidebarField).not.toContainText('Announcement Feed');
    });
});
