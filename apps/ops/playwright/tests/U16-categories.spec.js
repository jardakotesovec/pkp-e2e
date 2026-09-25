// @ts-check
/**
 * @file playwright/tests/U16-categories.spec.js
 *
 * Categories — OPS suite, parallel part: one test per canonical scenario
 * a preprint server runs without the site's background jobs: S1 (the
 * category tree built on Settings › Server › "Categories"), S3 (a preprint
 * placed in categories on its "Preprint entry" page), S4 (the author picks
 * categories on the wizard's "For Readers" step) and S7 {OJS OPS} (the
 * "Browse" block). S2, S5 and S6 read posted preprints on category pages,
 * which only the queued index job puts there, so they live in
 * `serial/U16-categories.spec.js`. Scenario 8 is {OMP} and costs the
 * server no test. The server's vocabulary throughout: Preprint Server
 * Manager, Moderator (`sectionEditor`), "Preprint" › the version ›
 * "Preprint entry", "Order of preprints", the page address
 * `preprints/category/{path}`.
 * Spec: docs/specs/U16-categories.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - OPS1 🐞: S1 never reads what stands under "Editorial Assignments".
 * - A9 🐞: S1 asserts that the path "my arts" is refused under "Path",
 *   never the wording of the message.
 * - A1 🐞: S1 reads "0 Items" and no preprint, never the missing "Nothing
 *   has been published in this category yet.".
 * - A12 🐞: S3 never reads the "Select Categories" window's arrow column
 *   heading.
 * - A20 🐞: S7 reads the marked link in the "Browse" block, never the
 *   breadcrumb's look.
 *
 * Seeding: scenario endpoints only (footnote s). Every scenario runs on its
 * own scratch preprint server (`u16s<n>opw…`) with a throwaway Preprint
 * Server Manager (`…mg`, the username twice as password); categories come
 * from the context scenario's `categories[]`, preprints from `POST
 * scenarios/submission` by a throwaway Author (`…au`; S3 with a Moderator
 * `…se` in `participants[]`, S4 a `submitted: false` draft). S1 and S7
 * seed English and French (`supportedLocales`, `supportedFormLocales`).
 * The "Categories" wizard setting of S4 and the plugin and sidebar box of
 * S7 are changed on screen, as the scenarios say. The category picture is
 * the fixture `profile-image-400.png`. The signed-out visitor is a second
 * browser context with an empty storage state (patterns.md, parallel
 * lesson 8); every actor gets its own `asUser` context. Every absence is a
 * settled read paired with a positive control taken the same way.
 *
 * Page objects: shared/playwright/pages/CategoriesPages.js (the tab, the
 * category window, the picker and its window, the category page, the
 * "Browse" block); the OPS publication pages and wizard from this tree;
 * AppearancePages, CustomContentPages and ContextIdentityPages for the
 * sidebar, the Plugins tab and the Metadata form. Everything runs in the
 * parallel `ops` project.
 */
const path = require('path');
const {test: base, expect} = require('../support/fixtures.js');
const {openWorkflow, PublicationScreen} = require('../pages/PublicationPages.js');
const {EditorialDashboardPage} = require('../pages/EditorialDashboardPage.js');
const wizard = require('../pages/SubmissionWizardPages.js');
const {WebsiteSettings} = require('../../../../shared/playwright/pages/AppearancePages.js');
const {PluginsTab} = require('../../../../shared/playwright/pages/CustomContentPages.js');
const {SettingsForm} = require('../../../../shared/playwright/pages/ContextIdentityPages.js');
const {CategoriesTab, CategoryWindow, CategoryPicker, CategoryPage, BrowseBlock} = require('../../../../shared/playwright/pages/CategoriesPages.js');

const T = 30_000;
const PICTURE = path.join(__dirname, '..', 'fixtures', 'files', 'profile-image-400.png');
const CV_LINE = 'Applied Science > Computer Science > Computer Vision';
const WORD = {word: 'preprints'};

/** A visitor's page: a second browser context with no session at all (parallel lesson 8). */
const test = base.extend({
    visitor: async ({browser, baseURL}, use) => {
        const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}, reducedMotion: 'reduce'});
        const page = await context.newPage();
        await use(page);
        await context.close();
    },
});

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u16${scenario}opw${testInfo.parallelIndex}${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
}

/** A scratch preprint server with a throwaway Preprint Server Manager (and any further users and keys). */
async function seedServer(opsApi, tag, extra = {}) {
    const {users = [], context = {}, ...rest} = extra;
    const answer = await opsApi.createContext({
        tag,
        context: {name: `U16 server ${tag}`, ...context},
        users: [{username: `${tag}mg`, givenName: 'Mona', familyName: 'Manager', email: `${tag}mg@mail.test`, roles: ['manager']}, ...users],
        ...rest,
    });
    return {manager: `${tag}mg`, answer};
}

/** A page of an actor's own signed-in browser context. */
async function actorPage(asUser, username) {
    return (await asUser(username)).newPage();
}

/** Open a preprint's workflow and its "Preprint entry" page; wait for the page's form. */
async function openEntry(page, contextPath, submissionId) {
    await openWorkflow(page, contextPath, submissionId);
    await new PublicationScreen(page).openPage('Preprint entry');
    await expect(page.getByRole('button', {name: 'Save', exact: true})).toBeVisible({timeout: T});
}

/**
 * Save a category window: the answer is 200, the window closes and
 * "Category saved" shows at the top right (Rule 4).
 *
 * @param {import('@playwright/test').Page} page
 * @param {CategoriesTab} tab
 * @param {import('../../../../shared/playwright/pages/CategoriesPages.js').CategoryWindow} window
 */
async function saveAndClose(page, tab, window) {
    expect((await window.save()).status()).toBe(200);
    await expect(window.root()).toHaveCount(0, {timeout: T});
    const notice = tab.savedNotice().first();
    await expect(notice).toBeVisible({timeout: T});
    const box = await notice.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.x + box.width > viewport.width / 2 && box.y < viewport.height / 3, 'the notice sits at the top right').toBe(true);
}

test.describe('categories', () => {
    test('S1: build the category tree', async ({asUser, opsApi, visitor}, testInfo) => {
        test.slow();
        test.setTimeout(360_000);
        const tag = makeTag('s1', testInfo);
        const {manager} = await seedServer(opsApi, tag, {
            context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            users: [{username: `${tag}au`, givenName: 'Ada', familyName: 'Author', email: `${tag}au@mail.test`, roles: ['author']}],
        });
        const item = await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: 'Scratch Preprint'});
        const page = await actorPage(asUser, manager);
        const tab = new CategoriesTab(page, tag);
        const picker = new CategoryPicker(page);
        const shown = () => tab.nameCells().filter({visible: true});

        // A server with no category: the table headed "Categories", "Add
        // Category" at its top right, the columns "Category Name" and
        // "Assigned To", "No Items"; the preprint's "Preprint entry" page has
        // no "Categories" field (Fields, the tab and the picker).
        await tab.goto();
        await expect(tab.addButton()).toBeVisible();
        await expect(tab.columnHeader('Category Name')).toBeVisible();
        await expect(tab.columnHeader('Assigned To')).toBeVisible();
        await expect(tab.table().locator('tbody')).toContainText('No Items');
        const tableBox = await tab.table().boundingBox();
        const addBox = await tab.addButton().boundingBox();
        expect(tableBox && addBox && addBox.x + addBox.width > tableBox.x + tableBox.width / 2 && addBox.y <= tableBox.y, '"Add Category" at the top right').toBe(true);
        await openEntry(page, tag, item.submissionId);
        await expect(picker.field()).toHaveCount(0);

        // The window, and a save with nothing typed: refused in the window,
        // nothing sent (Fields, the category window; Rule 4).
        await tab.goto();
        let window = await tab.openAdd();
        await expect(window.heading()).toBeVisible();
        await expect(window.saveButton()).toBeVisible();
        await expect(window.languageButton('French')).toBeVisible();
        await expect(window.field('Name')).toContainText('0/2 languages completed');
        await expect(window.field('Description')).toContainText('0/2 languages completed');
        const windowBox = await window.root().boundingBox();
        expect(windowBox && windowBox.x > 0 && windowBox.x + windowBox.width >= (page.viewportSize()?.width ?? 0) - 2, 'the window stands at the right').toBe(true);
        expect(await window.saveRefusedInPlace(window.errorSummary())).toBe(0);
        await expect(window.fieldErrors('Name')).toHaveText('This field is required.');
        await expect(window.fieldErrors('Path')).toHaveText('This field is required.');
        await expect(window.errorSummary()).toContainText('Please correct 2 errors.');
        await expect(window.goToButton('Name')).toBeVisible();
        await expect(window.goToButton('Path')).toBeVisible();
        await expect(window.root()).toBeVisible();

        // The window's fields, in two languages (Fields; OPS1 not read).
        await expect(window.label('Name in French').filter({visible: true})).toHaveCount(0);
        await expect(window.nameBox()).toBeVisible();
        await window.languageButton('French').click();
        await expect(window.label('Name in French').filter({visible: true}).first()).toBeVisible();
        await expect(window.nameBox('fr_CA')).toBeVisible();
        await expect(window.label('Description in French').filter({visible: true}).first()).toBeVisible();
        await expect(window.field('Path')).toContainText("The category's URL will be:");
        await expect(window.field('Path')).toContainText(/preprints\/category\/path/);
        await expect(window.field('Order of preprints')).toBeVisible();
        expect(await window.orderChosen()).toBe('Publication date (newest first)');

        // A top-level category (Rule 4; Fields, the tab).
        await window.nameBox().fill('Science');
        await window.nameBox('fr_CA').fill('Sciences');
        await window.pathBox().fill('science');
        await saveAndClose(page, tab, window);
        await expect(tab.row('Science')).toBeVisible({timeout: T});

        // Refused paths (Fields, "Path"; Rule 4; A9's wording not read).
        window = await tab.openAdd();
        await window.nameBox().fill('Arts');
        await window.pathBox().fill('science');
        expect((await window.save()).status()).toBe(400);
        await expect(window.fieldErrors('Path')).toHaveText('The category path already exists. Please enter a unique path.');
        await expect(window.root()).toBeVisible();
        await window.pathBox().fill('my arts');
        expect((await window.save()).status()).toBe(400);
        await expect(window.fieldErrors('Path')).not.toHaveText(/already exists/);
        await expect(window.fieldErrors('Path')).toHaveText(/\S/);
        await expect(window.root()).toBeVisible();
        await window.pathBox().fill('arts');
        await saveAndClose(page, tab, window);
        await expect(tab.row('Arts')).toBeVisible({timeout: T});

        // A path in capitals saves beside "arts" (Fields, "Path").
        window = await tab.openAdd();
        await window.nameBox().fill('Crafts');
        await window.pathBox().fill('ARTS');
        await saveAndClose(page, tab, window);
        await expect(tab.row('Crafts')).toBeVisible({timeout: T});
        await expect(tab.row('Arts')).toBeVisible();

        // Sub-categories: the row menu, a window naming no parent, the parent
        // row opened on the new row (Rules 1, 3).
        await tab.openMenu('Science');
        await expect(tab.menuItems()).toHaveText(['Add', 'Edit', 'Delete Category']);
        await tab.menuItems().filter({hasText: /^\s*Add\s*$/}).click();
        window = new CategoryWindow(page, 'Add Category');
        await window.expectOpen();
        await expect(window.heading()).toBeVisible();
        await expect(window.root()).not.toContainText('Science');
        await window.nameBox().fill('Physics');
        await window.pathBox().fill('physics');
        await saveAndClose(page, tab, window);
        await expect(tab.row('Physics')).toBeVisible({timeout: T});
        expect(await tab.indent('Physics')).toBeGreaterThan(await tab.indent('Science'));
        window = await tab.openRowAdd('Physics');
        await window.nameBox().fill('Optics');
        await window.pathBox().fill('optics');
        await saveAndClose(page, tab, window);
        await expect(tab.row('Optics')).toBeVisible({timeout: T});
        expect(await tab.indent('Optics')).toBeGreaterThan(await tab.indent('Physics'));

        // The arrows (Rules 2, 3).
        await tab.reload();
        await expect(shown()).toHaveText(['Arts', 'Crafts', 'Science']);
        await tab.toggle('Science');
        await expect(shown()).toHaveText(['Arts', 'Crafts', 'Science', 'Physics']);
        await tab.toggle('Physics');
        await expect(shown()).toHaveText(['Arts', 'Crafts', 'Science', 'Physics', 'Optics']);
        await tab.toggle('Science');
        await expect(shown()).toHaveText(['Arts', 'Crafts', 'Science']);
        await tab.toggle('Science');
        await expect(shown()).toHaveText(['Arts', 'Crafts', 'Science', 'Physics', 'Optics']);

        // Edit: the saved values, then a description, a picture and a new
        // path (Rules 4, 6).
        window = await tab.openEdit('Science');
        await expect(window.heading()).toBeVisible();
        await expect(window.pathBox()).toHaveValue('science');
        await expect(window.nameBox()).toHaveValue('Science');
        await window.languageButton('French').click();
        await expect(window.nameBox('fr_CA')).toHaveValue('Sciences');
        await window.typeDescription('Work in the natural sciences.');
        expect((await window.uploadCover(PICTURE)).status()).toBe(200);
        await window.pathBox().fill('natural-science');
        await saveAndClose(page, tab, window);

        // The visitor's page, with its description and picture (Fields, the
        // category's page; Rules 11, 12).
        const category = new CategoryPage(visitor, tag, WORD);
        await category.goto('natural-science');
        await expect(category.heading()).toHaveText('Science');
        expect(await category.crumbs()).toEqual(['Home', 'Science']);
        await expect(category.crumbLinks()).toHaveText(['Home']);
        await expect(category.currentCrumb()).toContainText('Science');
        await expect(category.currentCrumb().locator('a')).toHaveCount(0);
        await expect(category.picture()).toBeVisible();
        await expect.poll(async () => (await category.pictureSize()).naturalWidth).toBeGreaterThan(0);
        const size = await category.pictureSize();
        expect(Math.max(size.naturalWidth, size.width)).toBeLessThanOrEqual(100);
        expect(Math.max(size.naturalHeight, size.height)).toBeLessThanOrEqual(100);
        await expect(category.description()).toHaveText('Work in the natural sciences.');
        await expect(category.subcategoryLinks()).toHaveText(['Physics']);

        // Nothing listed yet (Rule 9; A1 not read).
        await expect(category.count()).toHaveText(/^\s*0 Items\s*$/);
        await expect(category.items()).toHaveCount(0);

        // The old address and the address in capitals (Rules 5, 13; Fields,
        // "Path").
        await category.expectBareNotFound('science');
        await category.goto('arts');
        await expect(category.heading()).toHaveText('Arts');
        await category.goto('ARTS');
        await expect(category.heading()).toHaveText('Crafts');

        // Control: the "Preprint entry" page, reloaded, now holds
        // "Categories" under "Placement" (Fields, the picker).
        await openEntry(page, tag, item.submissionId);
        await page.reload();
        await expect(page.getByRole('heading', {name: 'Preprint: Preprint entry'})).toBeVisible({timeout: T});
        await expect(picker.field()).toBeVisible({timeout: T});
        await expect(picker.groupHeading()).toContainText('Placement');
        await expect(picker.field()).toContainText('Selected: None');
        await expect(picker.selectButton()).toBeVisible();
    });

    test('S3: place a preprint in categories', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s3', testInfo);
        const title = `Placed Preprint ${tag}`;
        const {manager} = await seedServer(opsApi, tag, {
            categories: [
                {path: 'arts', title: 'Arts'},
                {
                    path: 'applied-science',
                    title: 'Applied Science',
                    children: [
                        {path: 'computer-science', title: 'Computer Science', children: [{path: 'computer-vision', title: 'Computer Vision'}]},
                        {path: 'engineering', title: 'Engineering'},
                    ],
                },
            ],
            users: [
                {username: `${tag}au`, givenName: 'Ada', familyName: 'Author', email: `${tag}au@mail.test`, roles: ['author']},
                {username: `${tag}se`, givenName: 'Sam', familyName: 'Moderator', email: `${tag}se@mail.test`, roles: ['sectionEditor']},
            ],
        });
        const item = await opsApi.createSubmission({
            tag,
            context: tag,
            submitter: `${tag}au`,
            title,
            participants: [{username: `${tag}se`, role: 'sectionEditor'}],
        });
        const page = await actorPage(asUser, `${tag}se`);
        const managerPage = await actorPage(asUser, manager);
        const dashboard = new EditorialDashboardPage(managerPage, tag);
        const picker = new CategoryPicker(page);
        const group = picker.field().locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " pkpFormGroup ")][1]');

        /** The manager's "Active submissions" filtered by one category, chosen in the Filters window's picker. */
        async function filterBy(text, line) {
            await dashboard.gotoView('active');
            await dashboard.expectViewHeading('Active submissions', 1);
            const modal = await dashboard.openFilters();
            await new CategoryPicker(managerPage, modal).choose(text, line);
            const listed = managerPage.waitForResponse((r) => /_submissions/.test(r.url()) && r.request().method() === 'GET', {timeout: T});
            await dashboard.applyFilters();
            await listed;
        }

        // Control: before the page's "Save", the "Arts" filter does not list
        // the preprint (Rule 17).
        await filterBy('Arts', 'Arts');
        await dashboard.expectViewHeading('Active submissions', 0);
        await expect(dashboard.emptyState()).toBeVisible();
        await expect(dashboard.row(title)).toHaveCount(0);

        // The field (Fields, the picker).
        await openEntry(page, tag, item.submissionId);
        await expect(picker.field()).toBeVisible({timeout: T});
        await expect(picker.groupHeading()).toContainText('Placement');
        await expect(group).toContainText('Assign categories to help organize and filter this publication.');
        await expect(picker.field()).toContainText('Selected: None');
        await expect(picker.selectButton()).toBeVisible();

        // Typing (Rule 16).
        await picker.type('sci');
        await expect(picker.options()).toHaveText(['Applied Science', 'Applied Science > Computer Science', CV_LINE, 'Applied Science > Engineering']);
        await picker.choose('sci', CV_LINE);
        await expect(picker.field()).toContainText(CV_LINE);
        await picker.type('SCI');
        await expect(picker.options()).toHaveText(['Applied Science', 'Applied Science > Computer Science', 'Applied Science > Engineering']);
        await picker.clearTyping();
        await expect(picker.options()).toHaveCount(0);

        // Leaving without saving: nothing asks, the field reads "Selected:
        // None" again (Rule 16b).
        const asked = [];
        page.on('dialog', (dialog) => {
            asked.push(dialog.type());
            dialog.accept().catch(() => {});
        });
        const screen = new PublicationScreen(page);
        await screen.openPage('Title & Abstract');
        await screen.openPage('Preprint entry');
        await expect(picker.field()).toContainText('Selected: None', {timeout: T});
        await expect(picker.removeButtons()).toHaveCount(0);
        expect(asked).toEqual([]);

        // The "Select Categories" window (Fields; Rule 16a; A12 not read).
        let window = await picker.openWindow();
        await expect(window.root().getByRole('heading', {name: 'Select Categories'})).toBeVisible();
        await expect(window.nameHeader()).toBeVisible();
        expect(await window.read()).toEqual([
            {name: 'Applied Science', bold: true, checked: false, visible: true},
            {name: 'Computer Science', bold: false, checked: false, visible: true},
            {name: 'Computer Vision', bold: false, checked: false, visible: true},
            {name: 'Engineering', bold: false, checked: false, visible: true},
            {name: 'Arts', bold: true, checked: false, visible: true},
        ]);
        await window.box('Computer Vision').check();
        await window.box('Arts').check();
        await window.save();
        await expect(picker.removeButtons()).toHaveCount(2, {timeout: T});
        await expect(picker.removeButton('Arts')).toBeVisible();
        await expect(picker.removeButton(CV_LINE)).toBeVisible();

        // The window's "Close" leaves the chips as they were (Rule 16a).
        window = await picker.openWindow();
        await expect(window.box('Arts')).toBeChecked();
        await expect(window.box('Computer Vision')).toBeChecked();
        await expect(window.box('Applied Science')).not.toBeChecked();
        await window.box('Arts').uncheck();
        await window.close();
        await expect(picker.removeButtons()).toHaveCount(2, {timeout: T});
        await expect(picker.removeButton('Arts')).toBeVisible();
        await expect(picker.removeButton(CV_LINE)).toBeVisible();

        // Saved, and back after a reload (Rule 16b).
        await screen.save();
        await page.reload();
        await expect(page.getByRole('heading', {name: 'Preprint: Preprint entry'})).toBeVisible({timeout: T});
        await expect(picker.removeButtons()).toHaveCount(2, {timeout: T});
        await expect(picker.removeButton('Arts')).toBeVisible();
        await expect(picker.removeButton(CV_LINE)).toBeVisible();

        // The filter (Rule 17): "Arts" and "Computer Vision" list the
        // preprint, its parent "Applied Science" does not.
        await filterBy('Arts', 'Arts');
        await dashboard.expectViewHeading('Active submissions', 1);
        await expect(dashboard.row(title)).toBeVisible();
        await filterBy('Vision', CV_LINE);
        await dashboard.expectViewHeading('Active submissions', 1);
        await expect(dashboard.row(title)).toBeVisible();
        await filterBy('Applied', 'Applied Science');
        await dashboard.expectViewHeading('Active submissions', 0);
        await expect(dashboard.emptyState()).toBeVisible();
        await expect(dashboard.row(title)).toHaveCount(0);
    });

    test('S4: the author picks categories while submitting', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        const {manager} = await seedServer(opsApi, tag, {
            categories: [{path: 'arts', title: 'Arts'}, {path: 'science', title: 'Science'}],
            users: [{username: `${tag}au`, givenName: 'Ada', familyName: 'Author', email: `${tag}au@mail.test`, roles: ['author']}],
        });
        const draft = await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `Wizard Preprint ${tag}`, submitted: false});
        const page = await actorPage(asUser, `${tag}au`);
        const managerPage = await actorPage(asUser, manager);
        const picker = new CategoryPicker(page);
        const relation = page.getByRole('radio', {name: 'This preprint has not been published elsewhere.'});

        // The Author on "For Readers" of their draft (a galley added on the
        // way, as the submit needs one). Control: before the "Save" on
        // Settings, the step has no "Categories" field (Settings bullet 1).
        await page.goto(wizard.wizardUrl(tag, draft.submissionId));
        await wizard.expectStep(page, wizard.STEPS.files);
        await wizard.addGalleyFile(page);
        await wizard.continueTo(page, wizard.STEPS.details);
        await wizard.continueTo(page, wizard.STEPS.contributors);
        await wizard.continueTo(page, wizard.STEPS.readers);
        await expect(relation).toBeVisible({timeout: T});
        await expect(picker.field()).toHaveCount(0);

        // The setting as a new server has it, then "Yes" saved (Settings
        // bullet 1).
        await managerPage.goto(`/index.php/${tag}/management/settings/workflow`);
        await managerPage.locator('#submission-button').first().click();
        await managerPage.locator('#metadata-button').first().click();
        const metadata = new SettingsForm(managerPage, 'input[name="submitWithCategories"]');
        await expect(metadata.form).toBeVisible({timeout: T});
        await expect(metadata.form).toContainText('Should the submitting author be asked to select a category when they make a new submission?');
        const no = metadata.form.getByRole('radio', {name: 'No, do not show authors this field.'});
        const yes = metadata.form.getByRole('radio', {name: 'Yes, add a categories field to the submission wizard.'});
        await expect(no).toBeChecked();
        await expect(yes).not.toBeChecked();
        await yes.check();
        await metadata.save();

        // The Author's step, reloaded (Fields, the picker; Actors row 3): a
        // reload reopens the wizard on its first step (U21 Rule 8; T-ops-1),
        // so "Continue" leads back to "For Readers".
        await page.reload();
        await wizard.expectStep(page, wizard.STEPS.files);
        await wizard.continueTo(page, wizard.STEPS.details);
        await wizard.continueTo(page, wizard.STEPS.contributors);
        await wizard.continueTo(page, wizard.STEPS.readers);
        await expect(picker.field()).toBeVisible({timeout: T});
        await expect(picker.field()).toContainText('Select only the categories that are appropriate for your submission.');
        await expect(picker.field()).toContainText('Selected: None');
        await expect(picker.selectButton()).toBeVisible();

        // A category picked (Rule 16).
        await picker.type('ar');
        await expect(picker.options()).toHaveText(['Arts']);
        await picker.choose('ar', 'Arts');
        expect(await picker.chipLines()).toEqual(['Arts']);

        // "Review" lists "Categories" with "Arts" (Fields, the picker).
        await wizard.setRelationStatus(page);
        await wizard.openReview(page);
        const categoriesItem = page.locator('.submissionWizard__reviewPanel__item').filter({has: page.getByText('Categories', {exact: true})});
        await expect(categoriesItem).toContainText('Arts');

        // The editor's side: the submitted preprint's "Preprint entry" holds
        // the chip "Arts" (Rules 16, 18).
        await wizard.confirmSubmit(page);
        await openEntry(managerPage, tag, draft.submissionId);
        const managerPicker = new CategoryPicker(managerPage);
        await expect(managerPicker.removeButtons()).toHaveCount(1, {timeout: T});
        await expect(managerPicker.removeButton('Arts')).toBeVisible();
    });

    test('S7: the "Browse" block on a preprint server', async ({asUser, opsApi, visitor}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s7', testInfo);
        const {manager} = await seedServer(opsApi, tag, {
            context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            categories: [
                {path: 'arts', title: {en: 'Arts', fr_CA: 'Beaux-arts'}},
                {path: 'zoology', title: {en: 'Zoology', fr_CA: 'Animaux'}},
                {
                    path: 'science',
                    title: {en: 'Science', fr_CA: 'Sciences'},
                    children: [{path: 'physics', title: {en: 'Physics', fr_CA: 'Physique'}, children: [{path: 'optics', title: {en: 'Optics', fr_CA: 'Optique'}}]}],
                },
                {path: 'mathematics', title: {en: 'Mathematics'}},
            ],
        });
        const page = await actorPage(asUser, manager);
        const category = new CategoryPage(visitor, tag, WORD);
        const block = new BrowseBlock(visitor);

        // Control: before the "Save", the visitor's "Arts" page has no
        // "Browse" block (Settings bullet 7).
        await category.goto('arts');
        await expect(category.heading()).toHaveText('Arts');
        await expect(visitor.locator('.block_browse')).toHaveCount(0);

        // The plugin: "Browse Block" unticked, then ticked (Settings bullet 7).
        const plugins = new PluginsTab(page, tag);
        await plugins.goto();
        await expect(plugins.enabledBox('browseblockplugin')).not.toBeChecked();
        expect(await plugins.enable('browseblockplugin')).toBe(200);
        await expect(plugins.enabledBox('browseblockplugin')).toBeChecked();

        // Placed: "Sidebar" holds "Browse Block", unticked; ticked and saved
        // (Settings bullet 7).
        const website = new WebsiteSettings(page, tag, {thumbnailField: 'serverThumbnail'});
        await website.goto();
        const setup = await website.open('appearance-setup');
        expect((await setup.sidebar.read()).find((r) => r.label === 'Browse Block')).toEqual({label: 'Browse Block', checked: false});
        await setup.sidebar.box('Browse Block').check();
        await setup.save();

        // The block: "Browse", "Categories", the tree in alphabetical order,
        // each a link to its page; the "Arts" link grayed with a grey bar at
        // its left (Rules 2, 14).
        await category.goto('arts');
        await expect(block.root()).toBeVisible({timeout: T});
        await expect(block.root().getByRole('heading', {name: 'Browse', exact: true})).toBeVisible();
        await expect(block.root()).toContainText('Categories');
        expect(await block.tree()).toEqual([
            {name: 'Arts', children: []},
            {name: 'Mathematics', children: []},
            {name: 'Science', children: [{name: 'Physics', children: [{name: 'Optics', children: []}]}]},
            {name: 'Zoology', children: []},
        ]);
        for (const name of ['Arts', 'Mathematics', 'Science', 'Physics', 'Optics', 'Zoology']) {
            await expect(block.link(name)).toHaveAttribute('href', new RegExp(`/preprints/category/${name.toLowerCase()}$`));
        }
        expect(await block.markedNames()).toEqual(['Arts']);
        const arts = await block.look('Arts');
        const zoology = await block.look('Zoology');
        expect(arts.color).not.toBe(zoology.color);

        // Another category's link: "Optics" marked alone (Rule 14).
        await block.link('Optics').click();
        await expect(category.heading()).toHaveText('Optics');
        expect(await block.markedNames()).toEqual(['Optics']);

        // In French: the named categories alphabetically, "Mathematics",
        // named in English only, last (Rule 2).
        await category.goto('arts', {locale: 'fr_CA'});
        await expect(block.root()).toBeVisible({timeout: T});
        expect(await block.tree()).toEqual([
            {name: 'Animaux', children: []},
            {name: 'Beaux-arts', children: []},
            {name: 'Sciences', children: [{name: 'Physique', children: [{name: 'Optique', children: []}]}]},
            {name: 'Mathematics', children: []},
        ]);
    });
});
