// @ts-check
/**
 * @file playwright/tests/U12-announcements.spec.js
 *
 * Announcements — OMP suite, the parallel part: one test per canonical
 * scenario the press runs here (S1, S2, S3, S5, all common) in the press's
 * own vocabulary (Press Manager, Series editor, "Additional Information"
 * for the introduction, OMP1; the header "Catalog Announcements About";
 * the "Edit" link read as "Open a new page to edit this information"),
 * plus S7's absence: a press installs no "Announcement Feed Plugin"
 * (multi-app rule 3, one absence test with a positive control per
 * assertion). S4 (the email, run through the site's background jobs) and
 * S6 (the site's own announcements, fleet-global state) are in
 * `serial/U12-announcements.spec.js`. Spec: docs/specs/U12-announcements.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 🐞
 * (S3 removes the type "Event" and asserts the dialog, the notice, the row
 * gone and the untyped announcements kept; what becomes of the typed
 * "Workshop" is not asserted either way), A2 🐞 and A3 🐞 (no test uploads a
 * ".jpeg" or an upper-case name, and the press keeps its default "Date
 * (Short)"), A9 🐞 (no edit ticks the email box), A11 🐞 (every panel is
 * closed by "Save" or its close control with nothing typed), A12 🐞 (S2
 * deletes an announcement whose picture was already removed, so no file is
 * left to read), A13 🐞 (S3 reloads before it reads the edited type's row),
 * A14 🐞 (the press's primary language is English), A5 ❓ and A6 ❓ (S3
 * chooses a type and reads it back; where it prints and whether it can be
 * cleared are not asserted), A8 ❓ (no test opens the Announcements page
 * while announcements are off), A10 ❓ (S1 reads the empty page's heading,
 * introduction and empty list; the missing sentence is not asserted).
 * The spec's Coverage section records everything else left out.
 *
 * Seeding: scenario endpoints only. Every scenario runs on its own scratch
 * press with throwaway accounts whose addresses carry app + test
 * (u12s1ompw0…@mail.test), because switching announcements on changes the
 * press's header and home page and publicknowledge keeps its defaults
 * (A1). The settings, the announcements and the second language come from
 * the context passthroughs `enableAnnouncements`, `numAnnouncementsHomepage`,
 * `announcements[]`, `supportedLocales` and `supportedFormLocales`
 * (footnotes s1–s5); the panel and the types window are the surfaces
 * under test, so S2's announcements and every type are added through
 * them. Announcements seeded in one request share a posted second, so S3
 * finds rows by title and asserts no order (scenarios.md). Signed-out
 * reads run in a second browser context with an empty storage state
 * (patterns.md parallel lesson 8). The picture never loads on the test
 * installs (seed-facts), so S2 asserts the `<img>` with its alternate text
 * and the stored file, never the rendered picture. Every absence is a
 * settled read paired with a positive control taken the same way: the
 * "404 Not Found" page against the same address answering once the box is
 * ticked, the header without "Announcements" against "Catalog" and
 * "About" in the same list, the side menu without its entry against
 * "Settings" in the same list, the refused text file's silence against
 * the PNG's upload request, the empty search against the phrases that
 * find a row, the missing feed plugin row against the "Web Feed Plugin"
 * row of the same grid. Waits are event-based (the announcements API,
 * the temporary-file upload, the grid's own requests, web-first
 * assertions) — no hard-coded sleeps. Everything here runs in the
 * parallel `omp` project.
 */
const path = require('node:path');
const fs = require('node:fs/promises');
const {test: base, expect} = require('../support/fixtures.js');
const {
    AnnouncementSettingsTab,
    AnnouncementsPage,
    PublicAnnouncements,
    websiteSettingsUrl,
    announcementsPageUrl,
    sideMenuLabels,
    sideMenuEntry,
} = require('../pages/AnnouncementsPages.js');

const PK = 'publicknowledge';
const PNG_PATH = path.resolve(__dirname, '../fixtures/files/profile-image-400.png');
const ACCESS_DENIED = 'The current role does not have access to this operation.';
const REQUIRED = 'This field is required.';
const REQUIRED_IN_ENGLISH = 'You must complete this field in English.';
const REFUSED_TYPE = "You can't upload files of this type.";
const NOT_INTEGER = 'This is not a valid integer.';
const MIN_ZERO = 'This must be at least 0.';
const DATE_INVALID = 'The date format is not valid. Enter each date in the format YYYY-MM-DD.';
const ONE_ERROR = 'Please correct one error.';
const PRESS_SENTENCE =
    'Announcements may be published to inform readers of news and events. Published announcements will appear on the Announcements page.';
const EDIT_SCREEN_READER = 'Open a new page to edit this information';
const CFP = 'Call for papers';
const CFP_SHORT = 'Deadline 1 June.';
const CFP_FULL = 'Submissions are open until 1 June.';
const CFP_ALT = 'Journal logo';
const WORKSHOP = 'Workshop';
const WORKSHOP_SHORT = 'Registration open.';
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

/** A date as YYYY-MM-DD in the install's time zone (UTC on the fleets, footnote s2). */
function isoDate(daysFromToday = 0) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + daysFromToday);
    return date.toISOString().slice(0, 10);
}

/** The PNG fixture as the file the scenario drops ("photo.png"). */
async function photoPng() {
    return {name: 'photo.png', mimeType: 'image/png', buffer: await fs.readFile(PNG_PATH)};
}

/** The stored image of an announcement (`public/presses/{contextId}/announcements/{id}.png`, footnote s2). */
function storedImage(contextId, announcementId) {
    return path.join(
        String(process.env.PKP_APP_ROOT),
        'public',
        'presses',
        String(contextId),
        'announcements',
        `${announcementId}.png`
    );
}

/** Whether a file exists on the fleet's disk. */
async function fileExists(file) {
    try {
        await fs.access(file);
        return true;
    } catch {
        return false;
    }
}

test.describe('Announcements (U12)', () => {
    test('S1: switch announcements on', {tag: ['@smoke']}, async ({asUser, ompApi, visitor}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s1', testInfo);
        const manager = scratchUser(tag, 'mg', 'Mona', 'Manager', ['manager']);
        const seriesEditor = scratchUser(tag, 'se', 'Sela', 'Series', ['sectionEditor']);
        const author = scratchUser(tag, 'au', 'Ada', 'Author', ['author']);
        const reader = scratchUser(tag, 'rd', 'Rosa', 'Reader', ['reader']);
        await ompApi.createContext({tag, users: [manager, seriesEditor, author, reader]});
        const pub = new PublicAnnouncements(visitor);

        // The public side while off: the Announcements page answers "404
        // Not Found"; the header carries "Catalog" and "About" but no
        // "Announcements" (Rule 2).
        await pub.expectNotFound(PublicAnnouncements.listUrl(tag));
        await pub.gotoHome(tag);
        expect(await pub.headerItems()).toEqual(['Catalog', 'About']);

        // The side menu while off: no "Announcements" entry; "Settings" is
        // there (Rule 2).
        const page = await (await asUser(manager.username)).newPage();
        await page.goto(websiteSettingsUrl(tag));
        let menu = await sideMenuLabels(page);
        expect(menu).toContain('Settings');
        expect(menu).not.toContain('Announcements');

        // The tab: "Enable announcements" unticked under the press's
        // sentence and no other field; ticked, "Additional Information"
        // (OMP1) and "Display on Homepage" appear (Fields).
        const tab = new AnnouncementSettingsTab(page);
        await tab.openTab();
        const form = tab.form();
        await expect(form.label(form.enableField())).toHaveText('Announcements');
        await expect(form.enableDescription()).toHaveText(PRESS_SENTENCE);
        await expect(form.enableBox()).not.toBeChecked();
        await expect(form.introductionField()).toHaveCount(0);
        await expect(form.countField()).toHaveCount(0);
        await form.enableBox().check();
        await expect(form.introductionField()).toBeVisible();
        await expect(form.label(form.introductionField())).toHaveText('Additional Information');
        await expect(form.introductionTooltip()).toContainText(
            'Enter any additional information that should be displayed to readers on the Announcements page.'
        );
        await expect(form.countField()).toBeVisible();
        await expect(form.label(form.countField())).toHaveText('Display on Homepage');
        await expect(form.countField().locator('.pkpFormField__description')).toHaveText(
            'How many announcements to display on the homepage. Leave this empty to display none.'
        );

        // A refused count: "abc" is refused with "This is not a valid
        // integer.", the tab reads "Please correct one error." with "Jump
        // to next error" and "Save" is grayed out; "-1" makes "Save" live
        // again and is refused with "This must be at least 0." (Fields).
        await form.countInput().fill('abc');
        await form.saveRefused(ONE_ERROR);
        await expect(form.fieldError(form.countField())).toHaveText(NOT_INTEGER);
        await expect(form.errorSummary().getByText('Jump to next error')).toBeVisible();
        await expect(form.saveButton()).toBeDisabled();
        await form.countInput().fill('-1');
        await expect(form.saveButton()).toBeEnabled();
        await form.saveRefused(ONE_ERROR);
        await expect(form.fieldError(form.countField())).toHaveText(MIN_ZERO);

        // Saved: the introduction and "2"; the side menu gains
        // "Announcements" with its icon between "DOIs" and "Settings" with
        // no reload (a window marker set before the save survives it);
        // after a reload it sits above "DOIs" (Rules 2, 3).
        await form.typeIntroduction('News from the editors.');
        await form.countInput().fill('2');
        await page.evaluate(() => {
            // @ts-ignore a marker on the window the save must not reload away
            window.__u12NoReload = true;
        });
        await form.save();
        await expect(sideMenuEntry(page, 'Announcements')).toBeVisible({timeout: T});
        // @ts-ignore the marker
        expect(await page.evaluate(() => window.__u12NoReload)).toBe(true);
        menu = await sideMenuLabels(page);
        expect(menu.indexOf('DOIs')).toBeGreaterThanOrEqual(0);
        expect(menu.indexOf('Announcements')).toBe(menu.indexOf('DOIs') + 1);
        expect(menu.indexOf('Settings')).toBe(menu.indexOf('Announcements') + 1);
        await expect(sideMenuEntry(page, 'Announcements').locator('svg')).toHaveCount(1);
        await page.reload();
        menu = await sideMenuLabels(page);
        expect(menu.indexOf('DOIs')).toBe(menu.indexOf('Announcements') + 1);

        // The public side on: the header carries "Announcements" after
        // "Catalog"; pressed, the Announcements page opens with its
        // breadcrumb, heading and introduction, then no announcement; the
        // home page carries no block and no "Skip to announcements" (the
        // other skip links are the control) (Rules 2, 9, 11, 12).
        await pub.gotoHome(tag);
        expect(await pub.headerItems()).toEqual(['Catalog', 'Announcements', 'About']);
        await expect(pub.homeBlock()).toHaveCount(0);
        await expect(pub.skipToAnnouncements()).toHaveCount(0);
        await expect(pub.skipLinks()).toHaveText(['Skip to main content', 'Skip to main navigation menu', 'Skip to site footer']);
        await pub.headerItem('Announcements').click();
        await expect(visitor).toHaveURL(new RegExp(`/${tag}/announcement$`));
        await expect(pub.breadcrumbs()).toContainText('Home');
        await expect(pub.breadcrumbs()).toContainText('Announcements');
        await expect(pub.heading()).toHaveText('Announcements');
        await expect(pub.introduction()).toContainText('News from the editors.');
        await expect(pub.summaries()).toHaveCount(0);
        await expect(pub.editLink()).toHaveCount(0);

        // The "Edit" link: as the Press Manager the public page carries
        // "Edit" with its screen-reader text; pressed, the press's
        // Announcements page opens on its "Announcements" tab with "No
        // items found." (Actors row 5; Rules 3, 4).
        const managerPub = new PublicAnnouncements(page);
        await managerPub.gotoList(tag);
        await expect(managerPub.editLink()).toBeVisible();
        await expect(managerPub.editLink()).toContainText('Edit');
        await expect(managerPub.editLink().locator('.pkp_screen_reader')).toHaveText(EDIT_SCREEN_READER);
        await managerPub.editLink().click();
        await expect(page).toHaveURL(/\/management\/settings\/announcements/);
        const mgmt = new AnnouncementsPage(page);
        await mgmt.expectOpen();
        await expect(mgmt.heading()).toHaveText('Announcements');
        await expect(mgmt.tab('Announcements')).toHaveAttribute('aria-selected', 'true');
        await expect(mgmt.tab('Announcement Types')).toBeVisible();
        await expect(mgmt.list().noItems()).toBeVisible();

        // Control: the Series editor, the Author and the Reader get the
        // access-denied page at both addresses and none has
        // "Announcements" in their side menu (Actors rows 1–2).
        for (const user of [seriesEditor, author, reader]) {
            const other = await (await asUser(user.username)).newPage();
            await other.goto(websiteSettingsUrl(tag));
            await expect(other.getByText(ACCESS_DENIED)).toBeVisible({timeout: T});
            await expect(other.locator('#setup-button')).toHaveCount(0);
            await other.goto(announcementsPageUrl(tag));
            await expect(other.getByText(ACCESS_DENIED)).toBeVisible({timeout: T});
            await expect(other.locator('.announcementsListPanel')).toHaveCount(0);
            await other.goto(`/index.php/${tag}/user/profile`);
            await expect(other.getByRole('heading', {name: 'Profile', exact: true})).toBeVisible({timeout: T});
            const otherMenu = await sideMenuLabels(other);
            expect(otherMenu.length).toBeGreaterThan(0);
            expect(otherMenu).not.toContain('Announcements');
        }
    });

    test('S2: add, edit and delete an announcement', async ({asUser, ompApi, visitor}, testInfo) => {
        test.setTimeout(420_000);
        const tag = makeTag('s2', testInfo);
        const manager = scratchUser(tag, 'mg', 'Mona', 'Manager', ['manager']);
        const {contextId} = await ompApi.createContext({
            tag,
            enableAnnouncements: true,
            numAnnouncementsHomepage: 2,
            users: [manager],
        });
        const pressName = `Scratch context ${tag}`;
        const today = isoDate(0);
        const tomorrow = isoDate(1);
        const pub = new PublicAnnouncements(visitor);

        // The empty list: "Announcements" in the side menu opens the page;
        // the tab reads "No items found." with "Search" and "Add
        // Announcement" (Rules 3, 4).
        const page = await (await asUser(manager.username)).newPage();
        await page.goto(websiteSettingsUrl(tag));
        await sideMenuEntry(page, 'Announcements').click();
        const mgmt = new AnnouncementsPage(page);
        await mgmt.expectOpen();
        await expect(page).toHaveURL(/\/management\/settings\/announcements/);
        const list = mgmt.list();
        await expect(list.noItems()).toBeVisible();
        await expect(list.rows()).toHaveCount(0);
        await expect(list.searchBox()).toBeVisible();
        await expect(list.addButton()).toBeVisible();

        // An empty save: the panel's fields and hints, the email box
        // unticked, no "Announcement Type"; "Save" is refused in place with
        // the summary, its "Go to Title" button, "Jump to next error", the
        // message under "Title" and "Save" grayed out (Fields; Rule 13).
        let panel = await list.openAdd();
        await expect(panel.label(panel.titleField())).toHaveText('Title');
        await expect(panel.label(panel.shortDescriptionField())).toHaveText('Short Description');
        await expect(panel.description(panel.shortDescriptionField())).toHaveText(
            'A brief description to appear along with the announcement title.'
        );
        await expect(panel.label(panel.announcementField())).toHaveText('Announcement');
        await expect(panel.description(panel.announcementField())).toHaveText('The full text of the announcement.');
        await expect(panel.label(panel.imageField())).toHaveText('Image');
        await expect(panel.label(panel.expiryField())).toHaveText('Expiry Date');
        await expect(panel.description(panel.expiryField())).toHaveText(
            'The announcement will be displayed to readers until this date. Leave blank if the announcement should be displayed indefinitely.'
        );
        await expect(panel.sendEmailBox()).toBeVisible();
        await expect(panel.sendEmailBox()).not.toBeChecked();
        await expect(panel.typeField()).toHaveCount(0);
        await panel.saveRefused(ONE_ERROR);
        await expect(panel.errorSummary().getByRole('button', {name: `Go to Title: ${REQUIRED}`, exact: true})).toBeVisible();
        await expect(panel.errorSummary().getByText('Jump to next error')).toBeVisible();
        await expect(panel.fieldError(panel.titleField())).toHaveText(REQUIRED);
        await expect(panel.saveButton()).toBeDisabled();

        // A refused date and a refused file: "tomorrow" is refused under
        // "Expiry Date"; a text file is listed in the box with the refusal
        // and "REMOVE FILE", nothing is sent (the PNG's upload request
        // below is the control), "Save" and "Upload File" are grayed out;
        // "REMOVE FILE" clears it and "Save" is live (Fields).
        await panel.titleInput().fill(CFP);
        await panel.expiryInput().fill('tomorrow');
        await panel.saveRefused(ONE_ERROR);
        await expect(panel.fieldError(panel.expiryField())).toHaveText(DATE_INVALID);
        await panel.expiryInput().fill('');
        const notes = testInfo.outputPath('notes.txt');
        await fs.writeFile(notes, `Notes for ${tag}\n`);
        let uploads = 0;
        page.on('request', (request) => {
            if (/temporaryFiles/.test(request.url()) && request.method() === 'POST') {
                uploads += 1;
            }
        });
        await panel.dropRefusedFile(notes, REFUSED_TYPE);
        await expect(panel.imageField().getByText('notes.txt')).toBeVisible();
        await expect(panel.removeFileLink()).toBeVisible();
        await expect(panel.removeFileLink()).toHaveText(/remove file/i);
        await expect(panel.errorSummary()).toContainText(ONE_ERROR);
        await expect(panel.saveButton()).toBeDisabled();
        await expect(panel.uploadFileButton()).toBeDisabled();
        expect(uploads).toBe(0);
        await panel.removeFileLink().click();
        await expect(panel.imageField().getByText('notes.txt')).toHaveCount(0);
        await expect(panel.fieldError(panel.imageField())).toHaveCount(0);
        await expect(panel.saveButton()).toBeEnabled();

        // The first announcement, with a picture: the texts, the PNG (a
        // preview with an "Alternate text" box), "Save": the panel closes
        // and "Call for papers" is the only row with "View", "Edit" and
        // "Delete" alone (Rule 5).
        await panel.typeRich('descriptionShort', CFP_SHORT);
        await panel.typeRich('description', CFP_FULL);
        await panel.uploadImage(await photoPng());
        expect(uploads).toBe(1);
        await expect(panel.altTextInput()).toBeVisible();
        await panel.altTextInput().fill(CFP_ALT);
        await expect(panel.sendEmailBox()).not.toBeChecked();
        const cfp = await panel.save();
        await expect(list.titles()).toHaveText([CFP]);
        await expect(list.viewLink(CFP)).toBeVisible();
        await expect(list.editButton(CFP)).toBeVisible();
        await expect(list.deleteButton(CFP)).toBeVisible();
        await expect(list.row(CFP).getByRole('button')).toHaveCount(2);
        await expect(list.row(CFP).getByRole('link')).toHaveCount(1);
        await expect.poll(() => fileExists(storedImage(contextId, cfp.id)), {timeout: T}).toBe(true);

        // The public pages, signed out: the summary with the picture's
        // description, the title link, today's date, the short description
        // and "Read More"; the home block with the same summary and the
        // skip link; "Read More" opens the announcement's page with its
        // breadcrumb, heading, date, picture, text and browser title, and
        // no other control (Rules 5, 9, 10, 11).
        await pub.gotoList(tag);
        await expect(pub.summaries()).toHaveCount(1);
        let summary = pub.summary(CFP);
        await expect(pub.image(summary)).toHaveAttribute('alt', CFP_ALT);
        await expect(pub.titleLink(summary)).toHaveText(CFP);
        await expect(pub.date(summary)).toHaveText(today);
        await expect(pub.summaryText(summary)).toContainText(CFP_SHORT);
        await expect(pub.readMore(summary)).toHaveAccessibleName(new RegExp(`^Read more about ${CFP}`));
        await pub.gotoHome(tag);
        await expect(pub.homeBlock()).toHaveCount(1);
        await expect(pub.homeHeading()).toHaveText('Announcements');
        await expect(pub.homeFirst()).toContainText(CFP);
        await expect(pub.homeFirst()).toContainText(CFP_SHORT);
        await expect(pub.image(pub.homeFirst())).toHaveAttribute('alt', CFP_ALT);
        await expect(pub.homeMore()).toHaveCount(0);
        await expect(pub.skipToAnnouncements()).toHaveText('Skip to announcements');
        await pub.gotoList(tag);
        await pub.readMore(pub.summary(CFP)).click();
        await expect(visitor).toHaveURL(new RegExp(`/${tag}/announcement/view/${cfp.id}$`));
        await expect(pub.breadcrumbs()).toContainText('Home');
        await expect(pub.breadcrumbs()).toContainText('Announcements');
        await expect(pub.breadcrumbs()).toContainText(CFP);
        await expect(pub.breadcrumbs().getByRole('link')).toHaveCount(2);
        await expect(pub.heading()).toHaveText(CFP);
        await expect(pub.fullDate()).toHaveText(today);
        await expect(pub.fullImage()).toHaveAttribute('alt', CFP_ALT);
        await expect(pub.fullText()).toContainText(CFP_FULL);
        await expect(visitor).toHaveTitle(`${CFP} | ${pressName}`);
        await expect(pub.full().locator('a, button')).toHaveCount(0);

        // "View": the announcement's page opens in the same window (Rule 4).
        await list.viewLink(CFP).click();
        await expect(page).toHaveURL(new RegExp(`/${tag}/announcement/view/${cfp.id}$`));
        await expect(page.locator('h1').first()).toHaveText(CFP);
        await mgmt.goto(tag);

        // The second announcement, short description only, expiring
        // tomorrow: "Workshop" is the first row; signed out, it is listed
        // first, its page shows the short description as its text, and the
        // home block shows it as a full summary with "Call for papers"
        // under it as a title link with its date (Rules 4, 5, 10, 11).
        panel = await list.openAdd();
        await panel.fill({title: WORKSHOP, shortDescription: WORKSHOP_SHORT, dateExpire: tomorrow});
        const workshop = await panel.save();
        await expect(list.titles()).toHaveText([WORKSHOP, CFP]);
        await pub.gotoList(tag);
        await expect(pub.summaryTitles()).toHaveText([WORKSHOP, CFP]);
        await pub.gotoView(tag, workshop.id);
        await expect(pub.heading()).toHaveText(WORKSHOP);
        await expect(pub.fullText()).toContainText(WORKSHOP_SHORT);
        await expect(pub.fullImage()).toHaveCount(0);
        await pub.gotoHome(tag);
        await expect(pub.homeFirst()).toContainText(WORKSHOP);
        await expect(pub.homeFirst()).toContainText(WORKSHOP_SHORT);
        await expect(pub.homeMoreTitles()).toHaveText([CFP]);
        await expect(pub.homeMore().first().locator('.date')).toHaveText(today);

        // Edit: the panel opens filled, tomorrow's date printed; a new
        // title saves in place, the row still first; signed out, listed
        // first (Rule 6).
        panel = await list.openEdit(WORKSHOP);
        await expect(panel.titleInput()).toHaveValue(WORKSHOP);
        expect(await panel.readRich('descriptionShort')).toBe(WORKSHOP_SHORT);
        expect(await panel.readRich('description')).toBe('');
        await expect(panel.expiryInput()).toHaveValue(tomorrow);
        const edited = `${WORKSHOP} 2027`;
        await panel.titleInput().fill(edited);
        await panel.save();
        await expect(list.titles()).toHaveText([edited, CFP]);
        await pub.gotoList(tag);
        await expect(pub.summaryTitles()).toHaveText([edited, CFP]);

        // Expired: today's date; the row stays; signed out, "Call for
        // papers" is alone on the page and in the block, the expired
        // announcement's address and an unknown one open the Announcements
        // page instead, and "View" on the row opens it too (Rules 4, 8, 10,
        // 11).
        panel = await list.openEdit(edited);
        await panel.expiryInput().fill(today);
        await panel.save();
        await expect(list.titles()).toHaveText([edited, CFP]);
        await pub.gotoList(tag);
        await expect(pub.summaryTitles()).toHaveText([CFP]);
        await pub.gotoHome(tag);
        await expect(pub.homeFirst()).toContainText(CFP);
        await expect(pub.homeMore()).toHaveCount(0);
        for (const id of [workshop.id, 999999]) {
            await pub.gotoView(tag, id);
            await expect(visitor).toHaveURL(new RegExp(`/${tag}/announcement$`));
            await expect(pub.heading()).toHaveText('Announcements');
            await expect(pub.summaryTitles()).toHaveText([CFP]);
            await expect(visitor.locator('[role="alert"], .pkp_notification')).toHaveCount(0);
        }
        await list.viewLink(edited).click();
        await expect(page).toHaveURL(new RegExp(`/${tag}/announcement$`));
        await expect(page.locator('h1').first()).toHaveText('Announcements');
        await mgmt.goto(tag);

        // Back from expiry: the date cleared; signed out, listed first again (Rule 8).
        panel = await list.openEdit(edited);
        await panel.expiryInput().fill('');
        await panel.save();
        await pub.gotoList(tag);
        await expect(pub.summaryTitles()).toHaveText([edited, CFP]);

        // The picture removed: the edit previews it with "Remove";
        // "Remove" (which brings "Restore Original") then "Save": the page
        // and the summaries are text-only and the file is gone (Fields
        // "Image"; Rule 15).
        panel = await list.openEdit(CFP);
        await expect(panel.preview()).toHaveCount(1);
        await expect(panel.altTextInput()).toHaveValue(CFP_ALT);
        await expect(panel.removeImageButton()).toBeVisible();
        // T-omp-1: the edit opens with "Remove" alone; "Restore Original"
        // is offered only once the picture is removed (the run's snapshot).
        await expect(panel.restoreImageButton()).toHaveCount(0);
        await panel.removeImageButton().click();
        await expect(panel.preview()).toHaveCount(0);
        await expect(panel.restoreImageButton()).toBeVisible();
        await panel.save();
        await pub.gotoView(tag, cfp.id);
        await expect(pub.heading()).toHaveText(CFP);
        await expect(pub.fullImage()).toHaveCount(0);
        await expect(pub.fullText()).toContainText(CFP_FULL);
        await pub.gotoList(tag);
        await expect(pub.image(pub.summary(CFP))).toHaveCount(0);
        await expect(pub.summaryText(pub.summary(CFP))).toContainText(CFP_SHORT);
        await pub.gotoHome(tag);
        await expect(pub.homeBlock().locator('img')).toHaveCount(0);
        await expect.poll(() => fileExists(storedImage(contextId, cfp.id)), {timeout: T}).toBe(false);

        // Delete: the dialog's sentence with "Yes" and "No"; "No" keeps the
        // row, "Yes" removes it; its address opens the Announcements page
        // and, signed out, "Call for papers" is alone (Rule 7).
        await list.openDelete(edited);
        await expect(list.deleteDialog()).toContainText(
            `Are you sure you want to permanently delete the announcement ${edited}?`
        );
        await expect(list.deleteDialog().getByRole('button', {name: 'Yes', exact: true})).toBeVisible();
        await expect(list.deleteDialog().getByRole('button', {name: 'No', exact: true})).toBeVisible();
        await list.answerDelete('No');
        await expect(list.titles()).toHaveText([edited, CFP]);
        await list.openDelete(edited);
        await list.answerDelete('Yes');
        await expect(list.titles()).toHaveText([CFP]);
        await pub.gotoView(tag, workshop.id);
        await expect(visitor).toHaveURL(new RegExp(`/${tag}/announcement$`));
        await expect(pub.summaryTitles()).toHaveText([CFP]);

        // Control: the seeded press's Announcements page still answers
        // "404 Not Found" (Rules 1, 2).
        await pub.expectNotFound(`/index.php/${PK}/en/announcement`);
    });

    test('S3: search the list; add, edit and remove announcement types', async ({asUser, ompApi, visitor}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s3', testInfo);
        const manager = scratchUser(tag, 'mg', 'Mona', 'Manager', ['manager']);
        const READING = 'Reading group';
        await ompApi.createContext({
            tag,
            enableAnnouncements: true,
            numAnnouncementsHomepage: 2,
            users: [manager],
            announcements: [
                {title: CFP, descriptionShort: `<p>${CFP_SHORT}</p>`},
                {title: WORKSHOP, descriptionShort: `<p>${WORKSHOP_SHORT}</p>`},
                {title: READING, description: '<p>Meets monthly.</p>'},
            ],
        });
        const pub = new PublicAnnouncements(visitor);

        // "Search": "call" and "june" find "Call for papers" alone (the
        // second by its short description), "june call" finds nothing, the
        // cleared box brings all three back (Rule 4).
        const page = await (await asUser(manager.username)).newPage();
        const mgmt = new AnnouncementsPage(page);
        await mgmt.goto(tag);
        const list = mgmt.list();
        await expect(list.rows()).toHaveCount(3);
        for (const title of [CFP, WORKSHOP, READING]) {
            await expect(list.row(title)).toHaveCount(1);
        }
        await list.search('call');
        await expect(list.titles()).toHaveText([CFP]);
        await list.search('june');
        await expect(list.titles()).toHaveText([CFP]);
        await list.search('june call');
        await expect(list.noItems()).toBeVisible();
        await expect(list.rows()).toHaveCount(0);
        await list.search('');
        await expect(list.rows()).toHaveCount(3);
        await expect(list.noItems()).toHaveCount(0);

        // The empty types table: headed "Announcement Types" with its
        // "Name" column, "No announcement types have been created." and
        // "Add Announcement Type" above it (Rule 13).
        let types = await mgmt.openTypesTab();
        await expect(types.heading()).toContainText('Announcement Types');
        await expect(types.nameColumn()).toBeVisible();
        await expect(types.noneCreated()).toBeVisible();
        await expect(types.rows()).toHaveCount(0);
        await expect(types.addLink()).toBeVisible();

        // A refused name: the window with "Name", "Save" and "Cancel";
        // "Save" with "Name" empty is refused in place (Fields).
        let window = await types.openAdd();
        await expect(window.heading()).toContainText('Add Announcement Type');
        await expect(window.nameInput('en')).toBeVisible();
        await expect(window.saveButton()).toBeVisible();
        await expect(window.cancelLink()).toBeVisible();
        await window.saveRefused();

        // Two types added: "Conference" then "Event", each with
        // "Announcement type added." (Rule 13).
        await window.nameInput('en').fill('Conference');
        await window.save();
        await expect(types.toast('Announcement type added.')).toBeVisible();
        await expect(types.row('Conference')).toHaveCount(1);
        await expect(types.noneCreated()).toBeHidden();
        window = await types.openAdd();
        await window.nameInput('en').fill('Event');
        await window.save();
        await expect(types.toast('Announcement type added.')).toBeVisible();
        await expect(types.row('Event')).toHaveCount(1);
        await expect(types.rows()).toHaveCount(2);

        // A type edited: the same window, "Conference 2027",
        // "Announcement type edited."; after a reload the row reads the
        // new name (Rule 13; the stale row of A13 is not asserted).
        window = await types.openEdit('Conference');
        await expect(window.nameInput('en')).toHaveValue('Conference');
        await window.nameInput('en').fill('Conference 2027');
        await window.save();
        await expect(types.toast('Announcement type edited.')).toBeVisible();
        await mgmt.goto(tag);
        types = await mgmt.openTypesTab();
        await expect(types.row('Conference 2027')).toHaveCount(1);
        await expect(types.row('Conference')).toHaveCount(0);
        await expect(types.rows()).toHaveCount(2);

        // A typed announcement: "Edit" on "Workshop" offers "Announcement
        // Type" as round buttons "Conference 2027" and "Event", none
        // chosen; "Event" chosen and saved is chosen on the next edit
        // (Fields "Announcement Type"; Rule 13).
        await mgmt.openListTab();
        let panel = await list.openEdit(WORKSHOP);
        await expect(panel.typeField()).toBeVisible();
        await expect(panel.label(panel.typeField())).toHaveText('Announcement Type');
        await expect(panel.typeField().getByRole('radio')).toHaveCount(2);
        await expect(panel.typeRadio('Conference 2027')).not.toBeChecked();
        await expect(panel.typeRadio('Event')).not.toBeChecked();
        await panel.typeRadio('Event').check();
        await panel.save();
        panel = await list.openEdit(WORKSHOP);
        await expect(panel.typeRadio('Event')).toBeChecked();
        await expect(panel.typeRadio('Conference 2027')).not.toBeChecked();
        await panel.close();

        // A type removed: the dialog's sentence with "OK" and "Cancel";
        // "OK" shows "Announcement type removed." and the row is gone,
        // "Conference 2027" staying (Rule 13).
        types = await mgmt.openTypesTab();
        await types.openRemove('Event');
        await expect(types.removeDialog()).toContainText(
            'Are you sure you wish to delete this item? This action cannot be undone.'
        );
        await expect(types.removeDialog().getByRole('button', {name: 'OK', exact: true})).toBeVisible();
        await expect(types.removeDialog().getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        await types.answerRemove('OK');
        await expect(types.toast('Announcement type removed.')).toBeVisible();
        await expect(types.row('Event')).toHaveCount(0);
        await expect(types.row('Conference 2027')).toHaveCount(1);

        // Control: "Call for papers" and "Reading group", which have no
        // type, are still listed after a reload and, signed out, still on
        // the Announcements page (Rule 13).
        await mgmt.goto(tag);
        await expect(list.row(CFP)).toHaveCount(1);
        await expect(list.row(READING)).toHaveCount(1);
        await pub.gotoList(tag);
        await expect(pub.summary(CFP)).toHaveCount(1);
        await expect(pub.summary(READING)).toHaveCount(1);
    });

    test('S5: announcements in a second language', async ({asUser, ompApi, visitor}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s5', testInfo);
        const manager = scratchUser(tag, 'mg', 'Mona', 'Manager', ['manager']);
        const FR = 'fr_CA';
        const APPEL = 'Appel à contributions';
        const DATE_LIMITE = 'Date limite le 1er juin.';
        await ompApi.createContext({
            tag,
            context: {supportedLocales: ['en', FR], supportedFormLocales: ['en', FR]},
            enableAnnouncements: true,
            numAnnouncementsHomepage: 2,
            announcements: [{title: {en: CFP}, descriptionShort: {en: `<p>${CFP_SHORT}</p>`}}],
            users: [manager],
        });
        const pub = new PublicAnnouncements(visitor);

        // The two-language panel: the language button shows "Title in
        // French", "Short Description in French" and "Announcement in
        // French" (Fields; Rule 14).
        const page = await (await asUser(manager.username)).newPage();
        const mgmt = new AnnouncementsPage(page);
        await mgmt.goto(tag);
        const list = mgmt.list();
        let panel = await list.openAdd();
        await expect(panel.titleField(FR)).toBeHidden();
        await panel.localeToggle('French').click();
        await expect(panel.titleField(FR)).toBeVisible();
        await expect(panel.label(panel.titleField(FR))).toContainText('Title in French');
        await expect(panel.label(panel.shortDescriptionField(FR))).toContainText('Short Description in French');
        await expect(panel.label(panel.announcementField(FR))).toContainText('Announcement in French');

        // A French-only save refused: "Please correct one error." with
        // "This field is required." under "Title" (Fields "Title"; Rule 14).
        await panel.titleInput(FR).fill(APPEL);
        await panel.saveRefused(ONE_ERROR);
        await expect(panel.fieldError(panel.titleField())).toHaveText(REQUIRED);
        await expect(panel.fieldError(panel.titleField(FR))).toHaveCount(0);

        // Saved in both languages: "Second call" is the first row (Rules 5, 14).
        await panel.titleInput().fill('Second call');
        await panel.typeRich('descriptionShort', DATE_LIMITE, FR);
        await panel.save();
        await expect(list.titles()).toHaveText(['Second call', CFP]);

        // The list and the pages in French: the rows read "Appel à
        // contributions" and "Call for papers"; signed out, the public page
        // and the home block print the French texts where they exist and
        // the English ones otherwise (Rule 14).
        await mgmt.goto(tag, {locale: FR});
        await expect(list.titles()).toHaveText([APPEL, CFP]);
        await pub.gotoList(tag, {locale: FR});
        await expect(pub.summaryTitles()).toHaveText([APPEL, CFP]);
        await expect(pub.summaryText(pub.summary(APPEL))).toContainText(DATE_LIMITE);
        await expect(pub.summaryText(pub.summary(CFP))).toContainText(CFP_SHORT);
        await pub.gotoHome(tag, {locale: FR});
        await expect(pub.homeFirst()).toContainText(APPEL);
        await expect(pub.homeFirst()).toContainText(DATE_LIMITE);
        await expect(pub.homeMoreTitles()).toHaveText([CFP]);

        // An edit emptying the primary language: with "/en" back, "Title"
        // cleared on "Second call" is refused with "You must complete this
        // field in English." (Fields "Title").
        await mgmt.goto(tag, {locale: 'en'});
        panel = await list.openEdit('Second call');
        await expect(panel.titleInput()).toHaveValue('Second call');
        await panel.titleInput().fill('');
        await panel.saveRefused(ONE_ERROR);
        await expect(panel.fieldError(panel.titleField())).toHaveText(REQUIRED_IN_ENGLISH);
        await panel.close();

        // A type in two languages: "Name" in English and in French; the
        // French alone is refused, the English one saves (Fields; Rule 13).
        const types = await mgmt.openTypesTab();
        const window = await types.openAdd();
        await window.nameInput('en').click();
        await expect(window.nameInput(FR)).toBeVisible();
        await window.nameInput(FR).fill('Conférence');
        await window.saveRefused();
        await window.nameInput('en').fill('Conference');
        await window.save();
        await expect(types.toast('Announcement type added.')).toBeVisible();
        await expect(types.row('Conference')).toHaveCount(1);

        // Control: signed out, the English page lists "Second call" and
        // "Call for papers" with its English text (Rule 14).
        await pub.gotoList(tag, {locale: 'en'});
        await expect(pub.summaryTitles()).toHaveText(['Second call', CFP]);
        await expect(pub.summaryText(pub.summary(CFP))).toContainText(CFP_SHORT);
    });

    test('S7: no announcement feed on a press (absence)', async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(180_000);
        const tag = makeTag('s7', testInfo);
        const manager = scratchUser(tag, 'mg', 'Mona', 'Manager', ['manager']);
        await ompApi.createContext({tag, enableAnnouncements: true, users: [manager]});
        const page = await (await asUser(manager.username)).newPage();

        // The Plugins grid lists the "Web Feed Plugin" row a press ships
        // (the control) and no "Announcement Feed Plugin" row (Rule 18).
        await page.goto(websiteSettingsUrl(tag));
        await page.locator('#plugins-button').click();
        const rows = page.locator('#pluginGridContainer tr.gridRow');
        const webFeed = rows.filter({hasText: 'Web Feed Plugin'});
        await expect(webFeed).toHaveCount(1, {timeout: T});
        await expect(webFeed).toBeVisible();
        await expect(rows.filter({hasText: 'Announcement Feed Plugin'})).toHaveCount(0);

        // The three feed addresses answer "404 Not Found"; the press's
        // Announcements page, read the same way, answers (the control).
        for (const type of ['atom', 'rss2', 'rss']) {
            const response = await page.request.get(
                `/index.php/${tag}/gateway/plugin/AnnouncementFeedGatewayPlugin/${type}`
            );
            expect(response.status(), `${type} feed`).toBe(404);
            expect(await response.text()).toContain('404 Not Found');
        }
        const control = await page.request.get(PublicAnnouncements.listUrl(tag));
        expect(control.status()).toBe(200);
        expect(await control.text()).toContain('Announcements');

        // The "Sidebar" list on Appearance › Setup offers blocks (the
        // control) and no "Announcement Feed Plugin" block.
        await page.locator('#appearance-button').click();
        await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).click();
        const sidebar = page
            .locator('#appearance [role="tabpanel"]:visible')
            .locator('.pkpFormField')
            .filter({has: page.locator('legend, .pkpFormFieldLabel', {hasText: /^\s*Sidebar\s*$/})});
        await expect(sidebar).toBeVisible({timeout: T});
        const blocks = sidebar.locator('input[type="checkbox"]');
        expect(await blocks.count()).toBeGreaterThan(0);
        await expect(sidebar.locator('input[value="AnnouncementFeedBlockPlugin"]')).toHaveCount(0);
        await expect(sidebar.getByText('Announcement Feed Plugin')).toHaveCount(0);
    });
});
