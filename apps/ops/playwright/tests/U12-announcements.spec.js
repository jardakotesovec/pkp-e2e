// @ts-check
/**
 * @file playwright/tests/U12-announcements.spec.js
 *
 * Announcements — OPS suite, one test per canonical scenario as a preprint
 * server runs it: S1, S2, S3, S5 and S8 (common) here, plus S7's absence
 * (a preprint server installs no "Announcement Feed Plugin", multi-app
 * rule 3); S4 (the email, which drains the site's job queue) and S6 (the
 * site's own announcements, a fleet-global setting) in
 * playwright/tests/serial/U12-announcements.spec.js.
 * Spec: docs/specs/U12-announcements.md
 *
 * The spec's "journal" is the server: its manager-level role is the
 * Preprint Server Manager alone (no Editor or Production Editor group, and
 * no role can lose "Permit changes to Settings", Actors), the settings
 * sentence names "server news and events", the header's "Announcements"
 * item comes first, the control roles are the Moderator (the `sectionEditor`
 * key), the Author and the Reader, and the stored picture lives under
 * `public/contexts/<id>/announcements/` (footnote s2).
 *
 * Deliberately NOT covered (register IDs; the spec's Coverage section
 * records everything else left out): A1, A3, A5, A6, A7, A8, A9, A10, A11,
 * A12, A13, A14, A15, A16, A17, A18, A19, A20, A22, OMP1, OMP2.
 *
 * Seeding: scenario endpoints only, through the context passthroughs
 * `enableAnnouncements`, `numAnnouncementsHomepage`, `announcements[]` and
 * `context.supportedFormLocales` for the second form language
 * (scenarios.md "POST scenarios/context"); no settings screen is driven to
 * reach a given. Every scenario runs on a scratch server with throwaway
 * accounts (footnotes s1–s8): the seeded server keeps announcements off
 * and no test changes it. Announcements seeded in one request share a
 * posted second (scenarios.md), so S3 finds rows by title. The picture
 * never loads on the test installs (seed-facts): the suite asserts the
 * `<img>` with its alternate text and the stored file under the server's
 * public files directory, never the rendered picture; S8's pictures are
 * the kept check's files (shared/playwright/checks/U12/I27A/) and the icon
 * SWA builds, and its refused text file's empty preview (Categories A17)
 * is read neither way. S2's "today" and "tomorrow" are UTC, the install's
 * zone, and the browser runs in the machine's zone, UTC on the VM and on
 * CI (a browser west of it meets A3). Signed-out reads run
 * in a second browser context with an empty storage state (patterns.md,
 * parallel lesson 8). Every absence is a settled read with a positive
 * control taken the same way (M4, M6): the refused saves' notice read as
 * a fresh one at the top right, the expired and unknown addresses' "no
 * message" against the Announcements page opened by its own address, the
 * text file named ".png" let in with no message against the refusal the
 * same box shows on "Save", the refused add's absence after a reload
 * against the four saved ones, the "404 Not Found" page against
 * the same address answering once the box is ticked, the header without
 * "Announcements" against "Archives" in the same list, the side menu
 * without its entry against "Settings" in the same list, the refused text
 * file's silence against the PNG's upload request, the empty search
 * against the phrases that find a row, the missing feed plugin row
 * against the "Web Feed Plugin" row of the same grid. Waits are
 * event-based (announcements API responses, temporary-file uploads, the
 * list's own fetch, web-first assertions) — no hard-coded sleeps.
 * Everything here runs in the parallel `ops` project.
 */
const fs = require('fs');
const path = require('path');
const {test, expect} = require('../support/fixtures.js');
const {expectNoticeTopRight} = require('../../../../shared/playwright/pages/SectionsPages.js');
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
    pluginRows,
    sidebarField,
    feedUrl,
} = require('../pages/AnnouncementsPages.js');

const SERVER = 'publicknowledge';
const PNG = path.resolve(__dirname, '../fixtures/files/profile-image-400.png');
const REQUIRED = 'This field is required.';
const ACCESS_DENIED = 'The current role does not have access to this operation.';
const TYPE_REFUSED = "You can't upload files of this type.";
const DATE_REFUSED = 'The date format is not valid. Enter each date in the format YYYY-MM-DD.';
const NOT_SAVED_ONE = 'The form was not saved because 1 error(s) were encountered. Please correct these errors and try again.';
const IMAGE_REFUSED = 'There was an error uploading this image.';
/** The kept check's pictures (footnote s8). */
const PICTURES = path.resolve(__dirname, '../../../../shared/playwright/checks/U12/I27A');
/** A 16×16 icon (an ICO holding a PNG), the one `shared/playwright/checks/U12/SWA/swa.js` builds (footnote s8). */
const ICO_B64 =
    'AAABAAEAEBAAAAEAIABSAAAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAAQAAAAEAgGAAAAH/P/YQAAABlJREFUeJxjOGFj858SzDBqwKgBowYMFwMA7fE/HyYCVCYAAAAASUVORK5CYII=';
const SETTINGS_SENTENCE =
    'Announcements may be published to inform readers of server news and events. Published announcements will appear on the Announcements page.';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u12${scenario}opw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for the scratch server (users.md: `<username>@mail.test`). */
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
 * The server's public announcements directory on disk (footnote s2:
 * `<public_files_dir>/contexts/<id>/announcements` on a preprint server),
 * read from the app's test config the way the harness reads it.
 */
function announcementsDir(contextId) {
    const appRoot = process.env.PKP_APP_ROOT;
    const cfg = fs.readFileSync(path.join(appRoot, 'config.test.inc.php'), 'utf8');
    const m = cfg.match(/^public_files_dir\s*=\s*(.+)$/m);
    // Relative to the app root, as the app reads it (make-test-config.js).
    const pub = path.resolve(appRoot, m ? m[1].trim() : 'public');
    return path.join(pub, 'contexts', String(contextId), 'announcements');
}

/**
 * The reader-facing page's main region as text, once its heading is on
 * screen (a server-rendered page, settled after its navigation).
 */
async function publicMainText(page) {
    const main = page.locator('.pkp_structure_main');
    await expect(main.locator('h1').first()).toBeVisible({timeout: 30_000});
    return (await main.innerText()).replace(/\s+/g, ' ').trim();
}

/** The access-denied page at `url`, as the signed-in `page`'s user. */
async function expectDenied(page, url) {
    await page.goto(url);
    await expect(page.getByText(ACCESS_DENIED, {exact: true})).toBeVisible({timeout: 30_000});
}

test.describe('announcements', () => {
    test('S1: switch announcements on', {tag: ['@smoke']}, async ({browser, baseURL, asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s1', testInfo);
        const manager = `${tag}mg`;
        const moderator = `${tag}se`;
        const author = `${tag}au`;
        const reader = `${tag}rd`;
        await opsApi.createContext({
            tag,
            users: [
                account(tag, 'mg', 'Mona', 'Manager', 'manager'),
                account(tag, 'se', 'Sara', 'Moderator', 'sectionEditor'),
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

        // The tab: the box unticked under the server's sentence and no
        // other field; ticked, "Introduction" and "Display on Homepage"
        // appear (Fields).
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
        // Each refusal shows the notice at the top right (Fields).
        await settings.countInput().fill('abc');
        await expectNoticeTopRight(page, NOT_SAVED_ONE, () => settings.saveRefused('Please correct one error.'));
        await expect(settings.fieldError(settings.countField())).toHaveText('This is not a valid integer.');
        await expect(settings.errorSummary()).toContainText('Jump to next error');
        await settings.countInput().fill('-1');
        await expect(settings.saveButton()).toBeEnabled();
        await expectNoticeTopRight(page, NOT_SAVED_ONE, () => settings.saveRefused('Please correct one error.'));
        await expect(settings.fieldError(settings.countField())).toHaveText('This must be at least 0.');

        // Saved: the side menu gains "Announcements" with its own icon
        // between "DOIs" and "Settings" with no reload (a window marker set
        // before the save survives it); after a reload it sits above
        // "DOIs" (Rules 2, 3).
        await settings.typeIntroduction('News from the editors.');
        await settings.countInput().fill('2');
        await expect(settings.saveButton()).toBeEnabled();
        await page.evaluate(() => {
            // @ts-ignore a marker on the window the save must not reload away
            window.__u12NoReload = true;
        });
        await settings.save();
        await expect(menu.announcementsEntry()).toBeVisible();
        // @ts-ignore the marker
        expect(await page.evaluate(() => window.__u12NoReload), 'the page was not reloaded').toBe(true);
        labels = await menu.topLevelLabels();
        expect(labels.indexOf('DOIs')).toBeGreaterThanOrEqual(0);
        expect(labels.indexOf('Announcements')).toBe(labels.indexOf('DOIs') + 1);
        expect(labels.indexOf('Settings')).toBe(labels.indexOf('Announcements') + 1);
        const icons = await menu.topLevelIcons();
        const own = icons.find((entry) => entry.label === 'Announcements');
        expect(own && own.icons, 'the entry carries one icon').toBe(1);
        const others = icons.filter((entry) => entry.label !== 'Announcements' && entry.icons > 0);
        expect(others.length, 'the other entries carry icons too').toBeGreaterThan(0);
        for (const other of others) {
            expect(other.drawing, `the icon is not the one of "${other.label}"`).not.toBe(own && own.drawing);
        }
        await page.reload();
        await expect(menu.announcementsEntry()).toBeVisible();
        labels = await menu.topLevelLabels();
        expect(labels.indexOf('Announcements')).toBeGreaterThanOrEqual(0);
        expect(labels.indexOf('Announcements')).toBeLessThan(labels.indexOf('DOIs'));

        // The public side on: the header carries "Announcements" first, on
        // a preprint server; pressed, the Announcements page opens with its
        // breadcrumb, heading and the introduction, then an empty list; the
        // home page carries no block (Rules 2, 9, 11, 12).
        await gotoHome(visitor, tag);
        items = await primaryNavItems(visitor);
        expect(items.indexOf('Announcements')).toBe(0);
        expect(items.indexOf('Archives')).toBe(1);
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
        // (read as "Edit Announcements" too); pressed, the server's
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

        // Control: the Moderator, the Author and the Reader each get the
        // access-denied page at both addresses and have no "Announcements"
        // in their side menu (Actors rows 1–2); the manager's own reads
        // above are the positive control.
        const dashboards = {
            [moderator]: `/index.php/${tag}/dashboard/editorial`,
            [author]: `/index.php/${tag}/dashboard/mySubmissions`,
            [reader]: `/index.php/${tag}/user/profile`,
        };
        for (const username of [moderator, author, reader]) {
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

    test('S2: add, edit and delete an announcement', async ({browser, baseURL, asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(360_000);
        const tag = makeTag('s2', testInfo);
        const manager = `${tag}mg`;
        const serverName = `Scratch context ${tag}`;
        const {contextId} = await opsApi.createContext({
            tag,
            enableAnnouncements: true,
            numAnnouncementsHomepage: 2,
            users: [account(tag, 'mg', 'Mona', 'Manager', 'manager')],
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
        await expectNoticeTopRight(page, NOT_SAVED_ONE, () => panel.saveRefused('Please correct one error.'));
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
        await expectNoticeTopRight(page, NOT_SAVED_ONE, () => panel.saveRefused('Please correct one error.'));
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
        await panel.altTextInput().fill('Server logo');
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
        await expect(summary.image).toHaveAttribute('alt', 'Server logo');
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
        await expect(home.first.image).toHaveAttribute('alt', 'Server logo');
        await expect(home.first.date).toHaveText(today);
        await expect(home.first.summary).toContainText('Deadline 1 June.');
        await expect(home.first.readMore).toBeVisible();
        await expect(skipToAnnouncements(visitor)).toHaveText('Skip to announcements');
        await home.first.readMore.click();
        await expect(view.heading()).toHaveText('Call for papers');
        await expect(visitor).toHaveURL(new RegExp(`/announcement/view/${callId}$`));
        await expect(view.breadcrumb()).toHaveText(/^\s*Home\s*\/\s*Announcements\s*\/\s*Call for papers\s*$/);
        await expect(view.date()).toHaveText(today);
        await expect(view.image()).toHaveAttribute('alt', 'Server logo');
        await expect(view.description()).toContainText('Submissions are open until 1 June.');
        expect(await view.article().locator('img, .description').evaluateAll((els) => els.map((e) => e.className))).toEqual([
            'obj_announcement_full_image',
            'description',
        ]);
        await expect(visitor).toHaveTitle(`Call for papers | ${serverName}`);
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
        await panel.expectRichText(panel.shortDescriptionField(), 'Registration open.');
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
        // "With no message": the page each address lands on reads exactly
        // as the Announcements page opened by its own address (the
        // positive read, taken first), with no notice on it.
        await publicList.goto();
        const listAsIs = await publicMainText(visitor);
        expect(listAsIs).toContain('Call for papers');
        await view.goto(workshopId);
        await expect(visitor).toHaveURL(/\/announcement$/);
        await expect(publicList.heading()).toHaveText('Announcements');
        await expect(view.container()).toHaveCount(0);
        expect(await publicList.titles()).toEqual(['Call for papers']);
        expect(await publicMainText(visitor), 'the expired address shows no message').toBe(listAsIs);
        await expect(visitor.locator('.cmp_notification, .pkp_notification')).toHaveCount(0);
        await view.goto(999999);
        await expect(visitor).toHaveURL(/\/announcement$/);
        await expect(publicList.heading()).toHaveText('Announcements');
        expect(await publicMainText(visitor), 'the unknown address shows no message').toBe(listAsIs);
        await expect(visitor.locator('.cmp_notification, .pkp_notification')).toHaveCount(0);
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
        // (T-ojs-1's sequence, the panel opening with "Remove" alone);
        // "Remove" then "Save" leaves the page and the summaries text-only
        // and deletes the file (Fields "Image"; Rule 15).
        panel = await list.openEdit('Call for papers');
        await expect(panel.preview()).toBeVisible();
        await expect(panel.altTextInput()).toHaveValue('Server logo');
        await expect(panel.removeButton()).toBeVisible();
        await expect(panel.uploadFileButton()).toBeVisible();
        await expect(panel.restoreButton()).toHaveCount(0);
        await panel.removeButton().click();
        await expect(panel.preview()).toHaveCount(0);
        await expect(panel.restoreButton()).toBeVisible();
        await panel.restoreButton().click();
        await expect(panel.preview()).toBeVisible();
        await expect(panel.altTextInput()).toHaveValue('Server logo');
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

        // Control: the seeded server's Announcements page still answers
        // "404 Not Found": nothing of the scratch server's reaches it
        // (Rules 1, 2).
        await expectNotFound(visitor, `/index.php/${SERVER}/en/announcement`);
    });

    test('S3: search the list; add, edit and remove announcement types', async ({browser, baseURL, asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s3', testInfo);
        const manager = `${tag}mg`;
        const seeded = await opsApi.createContext({
            tag,
            enableAnnouncements: true,
            numAnnouncementsHomepage: 2,
            announcements: [
                {title: 'Call for papers', descriptionShort: '<p>Deadline 1 June.</p>'},
                {title: 'Workshop', descriptionShort: '<p>Registration open.</p>'},
                {title: 'Reading group', description: '<p>Meets monthly.</p>'},
            ],
            users: [account(tag, 'mg', 'Mona', 'Manager', 'manager')],
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

        // A type removed: the confirm's sentence with "OK" and "Cancel";
        // "OK" removes the type with its toast and its row, "Conference
        // 2027" staying (Rule 13). What becomes of "Workshop" is A1 🐞,
        // not asserted (PRINCIPLES M3; U12 sweep 2026-11-09, SWB-5).
        await admin.openTypesTab();
        const typesAgain = admin.types();
        await typesAgain.openRemove('Event');
        await expect(typesAgain.confirmDialog()).toContainText('Are you sure you wish to delete this item? This action cannot be undone.');
        await expect(typesAgain.confirmDialog().getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        await typesAgain.confirmDialog().getByRole('button', {name: 'OK', exact: true}).click();
        await expect(typesAgain.toast('Announcement type removed.')).toBeVisible();
        await expect(typesAgain.row('Event')).toHaveCount(0);
        await expect.poll(() => typesAgain.rowNames()).toEqual(['Conference 2027']);
        await admin.goto();

        // Control: the two untyped announcements are still listed and,
        // signed out, still on the Announcements page (Rule 13).
        await expect(list.row('Call for papers')).toBeVisible();
        await expect(list.row('Reading group')).toBeVisible();
        await publicList.goto();
        await expect(publicList.summary('Call for papers').titleLink).toBeVisible();
        await expect(publicList.summary('Reading group').titleLink).toBeVisible();
    });

    test('S5: announcements in a second language', async ({browser, baseURL, asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s5', testInfo);
        const manager = `${tag}mg`;
        await opsApi.createContext({
            tag,
            context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            enableAnnouncements: true,
            numAnnouncementsHomepage: 2,
            announcements: [{title: 'Call for papers', descriptionShort: '<p>Deadline 1 June.</p>'}],
            users: [account(tag, 'mg', 'Mona', 'Manager', 'manager')],
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

    test('S7: no announcement feed on a preprint server (absence)', async ({browser, baseURL, asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const manager = `${tag}mg`;
        await opsApi.createContext({
            tag,
            enableAnnouncements: true,
            announcements: [{title: 'Older notice', description: '<p>Posted first.</p>'}],
            users: [account(tag, 'mg', 'Mona', 'Manager', 'manager')],
        });
        const page = await (await asUser(manager)).newPage();
        const visitor = await (await signedOut(browser, baseURL)).newPage();

        // The Plugins grid lists the "Web Feed Plugin" row a preprint
        // server ships (the control) and no "Announcement Feed Plugin" row
        // (Rule 18; footnote s7).
        const rows = await pluginRows(page, tag);
        const webFeed = rows.filter({hasText: 'Web Feed Plugin'});
        await expect(webFeed).toHaveCount(1);
        await expect(webFeed).toBeVisible();
        await expect(rows.filter({hasText: 'Announcement Feed Plugin'})).toHaveCount(0);
        await expect(page.locator('#pluginGridContainer')).not.toContainText('Announcement Feed');

        // The three feed addresses answer "404 Not Found", read the way a
        // feed link is followed (a plain GET); the server's Announcements
        // page, read the same way, answers with its list (the control).
        for (const type of ['atom', 'rss2', 'rss']) {
            const response = await visitor.request.get(feedUrl(tag, type), {failOnStatusCode: false, maxRedirects: 0});
            expect(response.status(), `the ${type} feed address`).toBe(404);
            expect(await response.text()).toContain('404 Not Found');
        }
        const control = await visitor.request.get(new PublicAnnouncements(visitor, tag).url(), {maxRedirects: 0});
        expect(control.status(), "the server's Announcements page").toBe(200);
        expect(await control.text()).toContain('Older notice');

        // The "Sidebar" list on Appearance › Setup offers the "Web Feed
        // Plugin" block a preprint server ships (the control: the list
        // holds "Web Feed Plugin" and "Language Toggle Block" alone, run
        // 2026-09-17) and no "Announcement Feed Plugin" block.
        const sidebar = await sidebarField(page, tag);
        const blocks = sidebar.locator('input[type=checkbox]');
        await expect(blocks.first()).toBeAttached();
        await expect(sidebar.getByText('Web Feed Plugin', {exact: true})).toBeVisible();
        await expect(sidebar.locator('input[type=checkbox][value="AnnouncementFeedBlockPlugin"]')).toHaveCount(0);
        await expect(sidebar).not.toContainText('Announcement Feed');
    });

    test('S8: pictures an announcement takes', async ({browser, baseURL, asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(420_000);
        const tag = makeTag('s8', testInfo);
        const manager = `${tag}mg`;
        const {contextId} = await opsApi.createContext({
            tag,
            enableAnnouncements: true,
            numAnnouncementsHomepage: 1,
            users: [account(tag, 'mg', 'Mona', 'Manager', 'manager')],
        });
        const page = await (await asUser(manager)).newPage();
        const visitor = await (await signedOut(browser, baseURL)).newPage();
        const admin = new AnnouncementsPage(page, tag);
        const list = admin.list();
        const publicList = new PublicAnnouncements(visitor, tag);
        const view = new AnnouncementView(visitor, tag);
        const home = homeBlock(visitor);
        const dir = announcementsDir(contextId);
        const picture = (name) => path.join(PICTURES, name);
        const ico = testInfo.outputPath('photo.ico');
        fs.writeFileSync(ico, Buffer.from(ICO_B64, 'base64'));
        const stored = (id, ext) => fs.existsSync(path.join(dir, `${id}.${ext}`));

        // A text file named ".png": the box lets it in with no message and
        // lists it under its name with "Alternate text" and "Remove" (its
        // preview not read: Categories A17); "Save" is refused under
        // "Image" with the summary and the notice; closed and reloaded, the
        // list reads "No items found." (Fields "Image").
        await admin.goto();
        await expect(list.emptyMessage()).toBeVisible();
        let panel = await list.openAdd();
        await panel.titleInput().fill('Not a picture');
        await panel.chooseFile(picture('notapicture.png'));
        await expect(panel.chosenFileName()).toHaveText('notapicture.png');
        await expect(panel.altTextInput()).toBeVisible();
        await expect(panel.removeButton()).toBeVisible();
        await expect(panel.fieldError(panel.imageField())).toHaveCount(0);
        await expect(panel.refusedFile()).toHaveCount(0);
        await expect(panel.errorSummary()).toHaveCount(0);
        await expectNoticeTopRight(page, NOT_SAVED_ONE, () => panel.saveRefusedByServer('Please correct one error.'));
        // The positive read of "no message" above: the same box, the same
        // locator, now carries the refusal.
        await expect(panel.imageError()).toHaveText(IMAGE_REFUSED);
        await expect(panel.errorLink(`Go to Image: ${IMAGE_REFUSED}`)).toBeVisible();
        await panel.close();
        await page.reload();
        await expect(admin.heading()).toHaveText('Announcements');
        await expect(list.emptyMessage()).toBeVisible();
        await expect(list.rows()).toHaveCount(0);

        // Four pictures added: a ".jpeg", an upper-case ".JPG", a WebP and
        // an icon, each with its alternate text; each "Save" closes the
        // panel and puts the new row first (Fields "Image"; Rule 5).
        const added = [
            {title: 'Notice 1', file: picture('photo.jpeg'), alt: 'Picture 1', ext: 'jpg', short: 'First notice.'},
            {title: 'Notice 2', file: picture('IMG_0001.JPG'), alt: 'Picture 2', ext: 'jpg'},
            {title: 'Notice 3', file: picture('photo.webp'), alt: 'Picture 3', ext: 'webp'},
            {title: 'Notice 4', file: ico, alt: 'Picture 4', ext: 'ico'},
        ];
        // The list orders by the posted time, kept to the second, and the
        // four adds here take less than a second each, where a person takes
        // longer: each "Save" waits until the clock (the install's own, the
        // same machine) has left the second the previous one was posted
        // in, so "first" means the newest (scenarios.md: a shared posted
        // second leaves the order arbitrary).
        const ids = {};
        let postedBy = 0;
        for (const [n, notice] of added.entries()) {
            panel = await list.openAdd();
            await panel.titleInput().fill(notice.title);
            if (notice.short) {
                await panel.typeShortDescription(notice.short);
            }
            await panel.uploadImage(notice.file);
            await panel.altTextInput().fill(notice.alt);
            const nextSecond = Math.floor(postedBy / 1000) * 1000 + 1000;
            await expect.poll(() => Date.now(), {message: 'a new posted second'}).toBeGreaterThanOrEqual(nextSecond);
            await panel.save();
            postedBy = Date.now();
            await expect(list.rows()).toHaveCount(n + 1);
            await expect.poll(() => list.rowTitles().then((titles) => titles[0]), {message: `"${notice.title}" is the first row`}).toBe(notice.title);
            ids[notice.title] = await list.idOf(notice.title);
            expect(stored(ids[notice.title], notice.ext), `${notice.title}'s picture is stored as .${notice.ext}`).toBe(true);
        }

        // Signed out: the Announcements page lists the four summaries, each
        // picture described by its alternate text; each announcement's page
        // shows its picture so described; the home page block's summary of
        // "Notice 4", the newest, shows "Picture 4" (Rules 9–11, 15).
        await publicList.goto();
        await expect(publicList.articles()).toHaveCount(4);
        expect((await publicList.titles()).sort()).toEqual(['Notice 1', 'Notice 2', 'Notice 3', 'Notice 4']);
        await expect(publicList.container()).not.toContainText('Not a picture');
        for (const notice of added) {
            await expect(publicList.summary(notice.title).image).toHaveAttribute('alt', notice.alt);
        }
        for (const notice of added) {
            await view.goto(ids[notice.title]);
            await expect(view.heading()).toHaveText(notice.title);
            await expect(view.image()).toHaveAttribute('alt', notice.alt);
        }
        await gotoHome(visitor, tag);
        await expect(home.articles).toHaveCount(1);
        await expect(home.first.titleLink).toHaveText('Notice 4');
        await expect(home.first.image).toHaveAttribute('alt', 'Picture 4');

        // New pictures on an edit: "Remove", a new picture of the same type
        // and a new alternate text; each "Save" closes the panel; signed
        // out, each page and summary shows the new description (Fields
        // "Image"; Rules 6, 15).
        const replaced = [
            {title: 'Notice 1', file: picture('IMG_0001.JPG'), alt: 'New picture 1', ext: 'jpg'},
            {title: 'Notice 2', file: picture('photo.jpeg'), alt: 'New picture 2', ext: 'jpg'},
            {title: 'Notice 3', file: picture('photo.webp'), alt: 'New picture 3', ext: 'webp'},
            {title: 'Notice 4', file: ico, alt: 'New picture 4', ext: 'ico'},
        ];
        for (const notice of replaced) {
            panel = await list.openEdit(notice.title);
            await expect(panel.preview()).toBeVisible();
            await panel.removeButton().click();
            await expect(panel.preview()).toHaveCount(0);
            await panel.uploadImage(notice.file);
            await panel.altTextInput().fill(notice.alt);
            await panel.save();
            await expect(list.row(notice.title)).toBeVisible();
            expect(stored(ids[notice.title], notice.ext), `${notice.title}'s new picture is stored as .${notice.ext}`).toBe(true);
        }
        await publicList.goto();
        for (const notice of replaced) {
            await expect(publicList.summary(notice.title).image).toHaveAttribute('alt', notice.alt);
        }
        for (const notice of replaced) {
            await view.goto(ids[notice.title]);
            await expect(view.heading()).toHaveText(notice.title);
            await expect(view.image()).toHaveAttribute('alt', notice.alt);
        }

        // Two refused edits: "Remove", a PNG named ".jpg", "Save": refused
        // under "Image" with the summary and the notice; the panel closed;
        // signed out, both keep their text and their picture, on their
        // pages and in their summaries, and the files stay (Fields "Image";
        // Rule 15).
        for (const title of ['Notice 1', 'Notice 2']) {
            panel = await list.openEdit(title);
            await panel.removeButton().click();
            await panel.uploadImage(picture('renamed.jpg'));
            await expectNoticeTopRight(page, NOT_SAVED_ONE, () => panel.saveRefusedByServer('Please correct one error.'));
            await expect(panel.imageError()).toHaveText(IMAGE_REFUSED);
            await panel.close();
        }
        await view.goto(ids['Notice 1']);
        await expect(view.heading()).toHaveText('Notice 1');
        await expect(view.description()).toContainText('First notice.');
        await expect(view.image()).toHaveAttribute('alt', 'New picture 1');
        await view.goto(ids['Notice 2']);
        await expect(view.heading()).toHaveText('Notice 2');
        await expect(view.image()).toHaveAttribute('alt', 'New picture 2');
        await publicList.goto();
        await expect(publicList.summary('Notice 1').summary).toContainText('First notice.');
        await expect(publicList.summary('Notice 1').image).toHaveAttribute('alt', 'New picture 1');
        await expect(publicList.summary('Notice 2').image).toHaveAttribute('alt', 'New picture 2');
        expect(stored(ids['Notice 1'], 'jpg'), "Notice 1's picture is kept").toBe(true);
        expect(stored(ids['Notice 2'], 'jpg'), "Notice 2's picture is kept").toBe(true);

        // The same manager's save: only "Title" changed, the save goes
        // through; signed out, the page shows the new heading, the text and
        // the picture (Fields "Image").
        panel = await list.openEdit('Notice 1');
        await panel.titleInput().fill('Notice 1 revised');
        await panel.save();
        await expect(list.row('Notice 1 revised')).toBeVisible();
        await expect(list.row('Notice 1')).toHaveCount(0);
        await view.goto(ids['Notice 1']);
        await expect(view.heading()).toHaveText('Notice 1 revised');
        await expect(view.description()).toContainText('First notice.');
        await expect(view.image()).toHaveAttribute('alt', 'New picture 1');

        // The picture removed after a refusal: the picture's address as the
        // page prints it, then "Remove" and "Save": signed out, the page and
        // the summary are text-only, and the file that address named is
        // gone (Rule 15, footnote s8; Fields "Image").
        const copied = await view.image().getAttribute('src');
        expect(copied || '', 'the printed address names the stored file').toMatch(new RegExp(`/announcements/${ids['Notice 1']}\\.jpg(\\?|$)`));
        expect(stored(ids['Notice 1'], 'jpg')).toBe(true);
        panel = await list.openEdit('Notice 1 revised');
        await expect(panel.preview()).toBeVisible();
        await panel.removeButton().click();
        await expect(panel.preview()).toHaveCount(0);
        await panel.save();
        await view.goto(ids['Notice 1']);
        await expect(view.heading()).toHaveText('Notice 1 revised');
        await expect(view.description()).toContainText('First notice.');
        await expect(view.image()).toHaveCount(0);
        await publicList.goto();
        await expect(publicList.summary('Notice 1 revised').summary).toContainText('First notice.');
        await expect(publicList.summary('Notice 1 revised').image).toHaveCount(0);
        expect(stored(ids['Notice 1'], 'jpg'), 'the removed picture is gone from the public files').toBe(false);

        // Another manager's save: the Site Administrator, from the side
        // menu, changes only "Title" of "Notice 2"; signed out, its page
        // shows the new heading and the picture (Fields "Image").
        const adminPage = await (await asUser('admin')).newPage();
        await adminPage.goto(`/index.php/${tag}/dashboard/editorial`);
        await new SideMenu(adminPage).announcementsEntry().click();
        const siteAdmin = new AnnouncementsPage(adminPage, tag);
        await expect(siteAdmin.heading()).toHaveText('Announcements');
        await expect(adminPage).toHaveURL(/management\/settings\/announcements/);
        const adminList = siteAdmin.list();
        await expect(adminList.rows()).toHaveCount(4);
        panel = await adminList.openEdit('Notice 2');
        await expect(panel.preview()).toBeVisible();
        await panel.titleInput().fill('Notice 2 revised');
        await panel.save();
        await expect(adminList.row('Notice 2 revised')).toBeVisible();
        await expect(adminList.row('Notice 2')).toHaveCount(0);
        await adminPage.close();
        await view.goto(ids['Notice 2']);
        await expect(view.heading()).toHaveText('Notice 2 revised');
        await expect(view.image()).toHaveAttribute('alt', 'New picture 2');

        // Control: signed out, the Announcements page lists the four, the
        // first text-only and the other three with their pictures, and no
        // "Not a picture": the refused add stored nothing (Fields "Image";
        // Rule 9).
        await publicList.goto();
        await expect(publicList.articles()).toHaveCount(4);
        expect((await publicList.titles()).sort()).toEqual(['Notice 1 revised', 'Notice 2 revised', 'Notice 3', 'Notice 4']);
        await expect(publicList.summary('Notice 1 revised').image).toHaveCount(0);
        await expect(publicList.summary('Notice 2 revised').image).toHaveAttribute('alt', 'New picture 2');
        await expect(publicList.summary('Notice 3').image).toHaveAttribute('alt', 'New picture 3');
        await expect(publicList.summary('Notice 4').image).toHaveAttribute('alt', 'New picture 4');
        await expect(publicList.container()).not.toContainText('Not a picture');
    });
});
