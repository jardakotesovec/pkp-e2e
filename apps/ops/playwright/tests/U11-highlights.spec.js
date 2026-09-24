// @ts-check
/**
 * @file playwright/tests/U11-highlights.spec.js
 *
 * Highlights — OPS suite, one test per canonical scenario (S1–S4, all
 * common; the feature has no app-specific scenario) as a preprint server
 * runs them: the spec's "journal" is the server, its Website settings are
 * the Server Manager's (a preprint server installs no Editor or Production
 * Editor group, Actors), the home page's blocks are the carousel, the
 * archive header, "Latest preprints" and "About the Server" (Rule 2), and
 * the stored picture lives under `public/contexts/<id>/highlights/`
 * (footnote g).
 * Spec: docs/specs/U11-highlights.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 🐞
 * (S2 never presses ordering mode's "Cancel"), A2 ❓ (every "URL" typed is
 * a full web address), A3 🐞 (no title carries formatting), A4 🐞 (S1
 * closes no panel without "Save"; S4's refused edit ends the test), A5 🐞
 * (the site's Highlights tab is never opened; no site highlight is seeded
 * or asserted), A6 ❓ (S3 reads which dot is on and presses none), A7 🐞
 * (S4 reads neither the French carousel's arrows nor Settings › Website's
 * fourth top tab), A8 ❓, A9 ❓ (S1 replaces no image).
 * The spec's Coverage section records everything else left out.
 *
 * Seeding: scenario endpoints only. Every scenario runs on a scratch server
 * with throwaway accounts (footnotes s1–s4); there is no highlight seed key,
 * so every highlight is added through the "Add Highlight" panel, the
 * surface under test. Scenario 4's second form language comes from the
 * context passthrough `supportedFormLocales` (scenarios.md "POST
 * scenarios/context"), never from the Languages screen. The slide's picture
 * never loads on the test installs (footnote g), so the suite asserts the
 * slide's `<img>` and its alternate text and the stored file under the
 * server's public files directory, never the rendered picture. Signed-out
 * reads run in a second browser context with an empty storage state
 * (patterns.md, parallel lesson 8). The mailbox silence (S1) is read in the
 * shared Mailpit scoped to the throwaway accounts' addresses and bounded by
 * a mail the test sends the same way, a discussion the manager opens on a
 * seeded preprint's Production stage (A8, M4; the control U43 uses on this
 * app); the Tasks silence is the bell and the window's "No Items", bounded
 * by the seeded preprint's own task (M6). The slide button's address is
 * followed against a routed stand-in for example.org, so no test reaches an
 * outside address. Waits are event-based (highlights API responses,
 * temporary-file uploads, web-first assertions) — no hard-coded sleeps.
 * Everything runs in the parallel `ops` project.
 */
const fs = require('fs');
const path = require('path');
const {test, expect} = require('../support/fixtures.js');
const {HighlightsTab, carousel} = require('../pages/HighlightsPages.js');
const {PublicationScreen, openWorkflow, addDiscussion} = require('../pages/PublicationPages.js');
const {TasksPanel} = require('../../../../shared/playwright/pages/NotificationsPages.js');

const SERVER = 'publicknowledge';
const PNG = path.resolve(__dirname, '../fixtures/files/profile-image-400.png');
const REQUIRED = 'This field is required.';
const ACCESS_DENIED = 'The current role does not have access to this operation.';
const TYPE_REFUSED = "You can't upload files of this type.";

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u11${scenario}opw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

/** A throwaway account for the scratch server. */
function account(tag, suffix, givenName, familyName, role) {
    return {username: `${tag}${suffix}`, givenName, familyName, email: mailOf(`${tag}${suffix}`), roles: [role]};
}

/**
 * The server's highlights directory under the public files (footnote g:
 * `<public_files_dir>/contexts/<id>/highlights` on a preprint server),
 * read from the app's test config the way the harness reads it.
 */
function highlightsDir(contextId) {
    const appRoot = process.env.PKP_APP_ROOT;
    const cfg = fs.readFileSync(path.join(appRoot, 'config.test.inc.php'), 'utf8');
    const m = cfg.match(/^public_files_dir\s*=\s*(.+)$/m);
    // Relative to the app root, as the app reads it (make-test-config.js).
    const pub = path.resolve(appRoot, m ? m[1].trim() : 'public');
    return path.join(pub, 'contexts', String(contextId), 'highlights');
}

/** A signed-out browser context (no inherited storage state). */
async function signedOut(browser, baseURL) {
    return browser.newContext({baseURL, storageState: {cookies: [], origins: []}, reducedMotion: 'reduce'});
}

/**
 * The server's home page in a page, in the given language ('' for the bare
 * address). The main block always carries the archive header's search
 * form, so its visibility bounds an absence read of the carousel.
 */
async function gotoHome(page, contextPath, locale = '') {
    await page.goto(`/index.php/${contextPath}${locale ? `/${locale}` : ''}`);
    await expect(page.locator('.pkp_structure_main')).toBeVisible({timeout: 30_000});
}

test.describe('highlights', () => {
    test('S1: add, edit and delete a highlight', {tag: ['@smoke']}, async ({browser, baseURL, asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(360_000);
        const tag = makeTag('s1', testInfo);
        const manager = `${tag}mg`;
        const sectionEditor = `${tag}se`;
        const author = `${tag}au`;
        const reader = `${tag}rd`;
        const spare = `${tag}x`;
        const {contextId} = await opsApi.createContext({
            tag,
            users: [
                account(tag, 'mg', 'Mona', 'Manager', 'manager'),
                account(tag, 'se', 'Sara', 'Moderator', 'sectionEditor'),
                account(tag, 'au', 'Ada', 'Author', 'author'),
                account(tag, 'rd', 'Rita', 'Reader', 'reader'),
                account(tag, 'x', 'Xena', 'Spare', 'author'),
            ],
        });
        const page = await (await asUser(manager)).newPage();
        const visitor = await (await signedOut(browser, baseURL)).newPage();
        const tab = new HighlightsTab(page, tag);
        const home = carousel(visitor);

        // The empty list: "No items found." with "Order" and "Add
        // Highlight" above it; signed out, no carousel on the home page
        // (Rules 3, 5, 9). The carousel's absence is bounded by the home
        // page's own content (the main block is on screen) and the archive
        // header is the first block.
        await tab.goto();
        await expect(tab.emptyMessage()).toBeVisible();
        await expect(tab.rows()).toHaveCount(0);
        await expect(tab.orderButton()).toBeVisible();
        await expect(tab.addButton()).toBeVisible();
        await gotoHome(visitor, tag);
        await expect(visitor.locator('.page_index_server .archiveHeader')).toBeVisible();
        await expect(home.block).toHaveCount(0);

        // An empty save: the panel opens with the five fields, none marked
        // required; "Save" with nothing filled is refused in place with
        // "Please correct 3 errors.", one "Go to …" button per fault, "Jump
        // to next error", the message under each of the three fields and
        // Save grayed out (Fields).
        let panel = await tab.openAdd();
        for (const field of [panel.titleField(), panel.descriptionField(), panel.urlField(), panel.buttonLabelField(), panel.imageField()]) {
            await expect(field).toBeVisible();
            await expect(field.locator('.pkpFormFieldLabel__required')).toHaveCount(0);
        }
        await expect(panel.label(panel.titleField())).toHaveText(/^\s*Title\s*$/);
        await expect(panel.label(panel.descriptionField())).toHaveText(/^\s*Description\s*$/);
        await expect(panel.label(panel.urlField())).toHaveText(/^\s*URL\s*$/);
        await expect(panel.label(panel.buttonLabelField())).toHaveText(/^\s*Button Label\s*$/);
        await expect(panel.label(panel.imageField())).toHaveText(/^\s*Image\s*$/);
        await panel.saveRefused('Please correct 3 errors.');
        await expect(panel.errorLink(`Go to Title: ${REQUIRED}`)).toBeVisible();
        await expect(panel.errorLink(`Go to URL: ${REQUIRED}`)).toBeVisible();
        await expect(panel.errorLink(`Go to Button Label: ${REQUIRED}`)).toBeVisible();
        await expect(panel.errorSummary().getByRole('button', {name: 'Jump to next error', exact: true})).toBeVisible();
        await expect(panel.fieldError(panel.titleField())).toHaveText(REQUIRED);
        await expect(panel.fieldError(panel.urlField())).toHaveText(REQUIRED);
        await expect(panel.fieldError(panel.buttonLabelField())).toHaveText(REQUIRED);
        await expect(panel.fieldError(panel.descriptionField())).toHaveCount(0);
        await expect(panel.fieldError(panel.imageField())).toHaveCount(0);

        // The first highlight: Save closes the panel and "Call for papers"
        // is the only row, with no reload; signed out, the slide is the
        // first block under the header, alone, without arrows or a dot
        // (Rules 2, 4, 5, 14).
        await panel.typeTitle('Call for papers');
        await panel.typeDescription('Submissions open until June.');
        await panel.urlInput().fill('https://example.org/cfp');
        await panel.buttonLabelInput().fill('Read more');
        await expect(panel.saveButton()).toBeEnabled();
        await panel.save();
        await expect(tab.rows()).toHaveCount(1);
        await expect(tab.row('Call for papers')).toBeVisible();
        await expect(tab.emptyMessage()).toHaveCount(0);
        await gotoHome(visitor, tag);
        await expect(home.block).toBeVisible();
        await expect(home.pageBlocks.first()).toHaveClass(/highlights/);
        await expect(home.slides).toHaveCount(1);
        await expect(home.titleOf(home.slide(0))).toHaveText('Call for papers');
        await expect(home.descriptionOf(home.slide(0))).toHaveText('Submissions open until June.');
        await expect(home.buttonOf(home.slide(0))).toHaveText('Read more');
        await expect(home.imageOf(home.slide(0))).toHaveCount(0);
        await expect(home.prev).toBeHidden();
        await expect(home.next).toBeHidden();
        await expect(home.dots).toHaveCount(1);
        await expect(home.dots.first()).toBeHidden();

        // The second highlight, with a picture: a text file is refused in
        // the box with "You can't upload files of this type." and nothing
        // is sent (bounded by the PNG's own upload, the one request the box
        // makes); the PNG shows a preview and an "Alternate text" box;
        // saved, "Annual conference" is the last row; signed out, two
        // slides with arrows and one dot each, the second with the picture
        // described "Conference hall" (Fields; Rules 4, 5, 10).
        const notes = testInfo.outputPath('notes.txt');
        fs.writeFileSync(notes, 'Not a picture.\n');
        const uploads = [];
        page.on('request', (r) => {
            if (/temporaryFiles/.test(r.url())) uploads.push(r.url());
        });
        panel = await tab.openAdd();
        await panel.typeTitle('Annual conference');
        await panel.typeDescription('Programme and registration.');
        await panel.urlInput().fill('https://example.org/conference');
        await panel.buttonLabelInput().fill('Register');
        await panel.fileInput().setInputFiles(notes);
        // The refused file is listed with "Remove file" and the sentence
        // under it, and the panel counts it as a form error: the summary,
        // its "Go to Image: …" and "Jump to next error" buttons, "Save" and
        // "Upload File" grayed out (Fields "Image").
        const uploadFileButton = panel.imageField().getByRole('button', {name: 'Upload File', exact: true});
        await expect(panel.refusedFile()).toContainText('notes.txt');
        await expect(panel.refusedFile().getByRole('link', {name: 'Remove file', exact: true})).toBeVisible();
        await expect(panel.dropzoneError()).toHaveText(TYPE_REFUSED);
        await expect(panel.errorSummary()).toContainText('Please correct one error.');
        await expect(panel.errorLink(`Go to Image: ${TYPE_REFUSED}`)).toBeVisible();
        await expect(panel.errorSummary().getByRole('button', {name: 'Jump to next error', exact: true})).toBeVisible();
        await expect(panel.saveButton()).toBeDisabled();
        await expect(uploadFileButton).toBeDisabled();
        await expect(panel.preview()).toHaveCount(0);
        // A picture dropped next clears both messages; the refused name
        // stays listed under the preview with its link.
        await panel.uploadImage(PNG);
        expect(uploads, 'the refused text file sent nothing; the PNG is the one upload').toHaveLength(1);
        await expect(panel.errorSummary()).toHaveCount(0);
        await expect(panel.dropzoneError()).toHaveCount(0);
        await expect(panel.refusedFile()).toContainText('notes.txt');
        await expect(panel.refusedFile().getByRole('link', {name: 'Remove file', exact: true})).toBeVisible();
        await expect(panel.saveButton()).toBeEnabled();
        // "Preview of the currently selected image." is the preview's
        // alternate text (footnote g), not a printed line.
        await expect(panel.preview()).toHaveAttribute('alt', 'Preview of the currently selected image.');
        await expect(panel.altTextInput()).toBeVisible();
        await expect(panel.imageField()).toContainText(
            'Describe this image for visitors viewing the site in a text-only browser or with assistive devices. Example: "Our editor speaking at the PKP conference."'
        );
        await panel.altTextInput().fill('Conference hall');
        await panel.save();
        await expect(tab.rows()).toHaveCount(2);
        expect(await tab.rowTitles()).toEqual(['Call for papers', 'Annual conference']);
        await gotoHome(visitor, tag);
        await expect(home.slides).toHaveCount(2);
        expect(await home.titles()).toEqual(['Call for papers', 'Annual conference']);
        await expect(home.prev).toBeVisible();
        await expect(home.prev).toHaveAttribute('aria-label', 'Previous slide');
        await expect(home.next).toBeVisible();
        await expect(home.next).toHaveAttribute('aria-label', 'Next slide');
        await expect(home.dots).toHaveCount(2);
        await expect(home.dots.first()).toBeVisible();
        const slideImage = home.imageOf(home.slide(1));
        await expect(slideImage).toHaveAttribute('alt', 'Conference hall');
        await expect(home.imageOf(home.slide(0))).toHaveCount(0);
        // The stored file (Rule 10): the slide's picture is the server's
        // public file, one per highlight.
        const imageName = path.basename(new URL(await slideImage.getAttribute('src'), baseURL).pathname);
        const storedImage = path.join(highlightsDir(contextId), imageName);
        expect(fs.existsSync(storedImage), `the picture is stored at ${storedImage}`).toBe(true);

        // Edit: the panel opens with the row's values and the picture
        // previewed; "Remove" clears it, "Restore Original" brings it back,
        // "Remove" again and a new title saved: the row reads the new title
        // in place; signed out, the second slide is text-only (Fields;
        // Rules 6, 10).
        panel = await tab.openEdit('Annual conference');
        expect(await panel.titleText()).toBe('Annual conference');
        await expect(panel.urlInput()).toHaveValue('https://example.org/conference');
        await expect(panel.buttonLabelInput()).toHaveValue('Register');
        await expect(panel.preview()).toBeVisible();
        await expect(panel.altTextInput()).toHaveValue('Conference hall');
        await panel.removeButton().click();
        await expect(panel.preview()).toHaveCount(0);
        await expect(panel.restoreButton()).toBeVisible();
        await panel.restoreButton().click();
        await expect(panel.preview()).toBeVisible();
        await expect(panel.altTextInput()).toHaveValue('Conference hall');
        await panel.removeButton().click();
        await expect(panel.preview()).toHaveCount(0);
        await panel.typeTitle('Annual conference 2027');
        await panel.save();
        await expect(tab.rows()).toHaveCount(2);
        expect(await tab.rowTitles()).toEqual(['Call for papers', 'Annual conference 2027']);
        await gotoHome(visitor, tag);
        await expect(home.slides).toHaveCount(2);
        await expect(home.titleOf(home.slide(1))).toHaveText('Annual conference 2027');
        await expect(home.imageOf(home.slide(1))).toHaveCount(0);
        await expect(home.slide(1)).not.toHaveClass(/-has-image/);
        expect(fs.existsSync(storedImage), 'the removed picture is gone from the public files').toBe(false);

        // Delete: the dialog's sentence with "Yes" and "No"; "No" keeps the
        // row; "Yes" removes it and, signed out, "Call for papers" is alone
        // again, without arrows or a dot (Rules 4, 8).
        await tab.deleteButton('Annual conference 2027').click();
        await expect(tab.deleteDialog()).toBeVisible();
        await expect(tab.deleteDialog()).toContainText(
            'Are you sure you want to delete Annual conference 2027? This action can not be undone.'
        );
        await expect(tab.deleteDialog().getByRole('button', {name: 'Yes', exact: true})).toBeVisible();
        await tab.deleteDialog().getByRole('button', {name: 'No', exact: true}).click();
        await expect(tab.deleteDialog()).toHaveCount(0);
        await expect(tab.rows()).toHaveCount(2);
        await expect(tab.row('Annual conference 2027')).toBeVisible();
        await tab.deleteButton('Annual conference 2027').click();
        await expect(tab.deleteDialog()).toBeVisible();
        await tab.confirmDelete();
        await expect(tab.rows()).toHaveCount(1);
        await expect(tab.row('Annual conference 2027')).toHaveCount(0);
        await expect(tab.row('Call for papers')).toBeVisible();
        await gotoHome(visitor, tag);
        await expect(home.slides).toHaveCount(1);
        await expect(home.titleOf(home.slide(0))).toHaveText('Call for papers');
        await expect(home.prev).toBeHidden();
        await expect(home.next).toBeHidden();
        await expect(home.dots.first()).toBeHidden();

        // Nothing else happens (Side effects): the header's Tasks panel
        // holds no task — the bell carries no number and the window reads
        // "No Items"; then a preprint seeded on the server is the positive
        // control, the same bell and window carrying its task.
        await page.goto(`/index.php/${tag}/dashboard/editorial`);
        const tasks = new TasksPanel(page);
        await tasks.expectCount(0);
        await tasks.open();
        await expect(tasks.noItems()).toBeVisible();
        await expect(tasks.rows()).toHaveCount(0);
        await tasks.close();
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: tag,
            submitter: spare,
            title: `Submission ${tag}`,
        });
        await page.reload();
        await tasks.expectCount(1);
        await tasks.open();
        await expect(tasks.rows()).toHaveCount(1);
        await tasks.close();

        // No email arrived from the saves and deletes: a discussion the
        // manager opens on the seeded preprint's Production stage with the
        // spare ticked is the one mail sent the same way and bounds the
        // read (its copy reaches the spare, and the manager's own copy as
        // the discussion's creator is the only mail the manager's box may
        // hold); the three other throwaway addresses hold nothing.
        const discussion = `Control ${tag}`;
        await openWorkflow(page, tag, submissionId);
        await new PublicationScreen(page).openProductionStage();
        await addDiscussion(page, {name: discussion, message: `Control message ${tag}.`, participants: [spare]});
        await pkpMail.find({to: mailOf(spare), subject: discussion});
        expect(
            await pkpMail.count({to: mailOf(manager)}),
            "the manager's box holds nothing but the discussion's own copy"
        ).toBe(await pkpMail.count({to: mailOf(manager), subject: discussion}));
        for (const username of [sectionEditor, author, reader]) {
            expect(await pkpMail.count({to: mailOf(username)}), `no mail to ${username}`).toBe(0);
        }

        // Control: Moderator, Author and Reader each get the access-denied
        // page at the address the manager used (Actors row 1); the
        // manager's own visit above is the positive control.
        for (const username of [sectionEditor, author, reader]) {
            const other = await (await asUser(username)).newPage();
            await other.goto(`/index.php/${tag}/en/management/settings/website`);
            await expect(other.getByText(ACCESS_DENIED, {exact: true})).toBeVisible({timeout: 30_000});
            await expect(other.locator('#setup-button')).toHaveCount(0);
            await other.close();
        }
    });

    test('S2: reorder the highlights', async ({browser, baseURL, asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const manager = `${tag}mg`;
        await opsApi.createContext({tag, users: [account(tag, 'mg', 'Mona', 'Manager', 'manager')]});
        const page = await (await asUser(manager)).newPage();
        const visitor = await (await signedOut(browser, baseURL)).newPage();
        const tab = new HighlightsTab(page, tag);
        const home = carousel(visitor);

        await tab.goto();
        for (const title of ['First', 'Second', 'Third']) {
            await tab.addHighlight({title, url: `https://example.org/${title.toLowerCase()}`, label: 'Open'});
        }
        expect(await tab.rowTitles()).toEqual(['First', 'Second', 'Third']);

        // Control: before "Save Order" the home page shows the slides in
        // the order they were added (Rules 4, 5).
        await gotoHome(visitor, tag);
        await expect(home.slides).toHaveCount(3);
        expect(await home.titles()).toEqual(['First', 'Second', 'Third']);

        // Ordering mode: "Order" gives way to "Save Order" and "Cancel",
        // "Add Highlight" is grayed out, each row's "Edit" and "Delete"
        // give way to an up and a down arrow (Rule 9).
        await tab.orderButton().click();
        await expect(tab.saveOrderButton()).toBeVisible();
        await expect(tab.cancelOrderButton()).toBeVisible();
        await expect(tab.orderButton()).toHaveCount(0);
        await expect(tab.addButton()).toBeDisabled();
        for (const title of ['First', 'Second', 'Third']) {
            await expect(tab.upArrow(title)).toBeVisible();
            await expect(tab.downArrow(title)).toBeVisible();
            await expect(tab.editButton(title)).toHaveCount(0);
            await expect(tab.deleteButton(title)).toHaveCount(0);
        }

        // The ends: the first row's up arrow and the last row's down arrow
        // move nothing (Rule 9); the move below is the positive control.
        await tab.upArrow('First').click();
        await tab.downArrow('Third').click();
        expect(await tab.rowTitles()).toEqual(['First', 'Second', 'Third']);

        // A move saved: "Third" up twice, "Save Order" ends ordering mode
        // with the rows kept; a reload shows the same; signed out, the
        // slides come "Third", "First", "Second" as "Next slide" walks them
        // (Rules 4, 9, 9a).
        await tab.upArrow('Third').click();
        await expect(tab.rows().locator('.listPanel__itemTitle').nth(1)).toHaveText('Third');
        await tab.upArrow('Third').click();
        await expect(tab.rows().locator('.listPanel__itemTitle').nth(0)).toHaveText('Third');
        expect(await tab.rowTitles()).toEqual(['Third', 'First', 'Second']);
        await tab.saveOrder();
        await expect(tab.saveOrderButton()).toHaveCount(0);
        await expect(tab.cancelOrderButton()).toHaveCount(0);
        await expect(tab.addButton()).toBeEnabled();
        for (const title of ['First', 'Second', 'Third']) {
            await expect(tab.editButton(title)).toBeVisible();
            await expect(tab.deleteButton(title)).toBeVisible();
            await expect(tab.upArrow(title)).toHaveCount(0);
        }
        expect(await tab.rowTitles()).toEqual(['Third', 'First', 'Second']);
        await tab.goto();
        await expect(tab.rows()).toHaveCount(3);
        expect(await tab.rowTitles()).toEqual(['Third', 'First', 'Second']);
        await gotoHome(visitor, tag);
        await expect(home.slides).toHaveCount(3);
        expect(await home.titles()).toEqual(['Third', 'First', 'Second']);
        await expect(home.titleOf(home.activeSlide)).toHaveText('Third');
        await home.next.click();
        await expect(home.titleOf(home.activeSlide)).toHaveText('First');
        await home.next.click();
        await expect(home.titleOf(home.activeSlide)).toHaveText('Second');

        // A new highlight after a saved order goes last, in the list and on
        // the home page (Rules 5, 7).
        await tab.addHighlight({title: 'Fourth', url: 'https://example.org/fourth', label: 'Open'});
        expect(await tab.rowTitles()).toEqual(['Third', 'First', 'Second', 'Fourth']);
        await gotoHome(visitor, tag);
        await expect(home.slides).toHaveCount(4);
        expect(await home.titles()).toEqual(['Third', 'First', 'Second', 'Fourth']);
    });

    test('S3: read the carousel as a visitor', async ({browser, baseURL, asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const manager = `${tag}mg`;
        await opsApi.createContext({tag, users: [account(tag, 'mg', 'Mona', 'Manager', 'manager')]});
        const page = await (await asUser(manager)).newPage();
        const tab = new HighlightsTab(page, tag);
        await tab.goto();
        await tab.addHighlight({
            title: 'Call for papers',
            description: 'Submissions open until June.',
            url: 'https://example.org/cfp',
            label: 'Read more',
        });
        await tab.addHighlight({
            title: 'Annual conference',
            description: 'Programme and registration.',
            url: 'https://example.org/conference',
            label: 'Register',
            image: PNG,
            alt: 'Conference hall',
        });
        await tab.addHighlight({title: 'New book series', url: 'https://example.org/books', label: 'Browse'});
        await page.close();

        const visitor = await (await signedOut(browser, baseURL)).newPage();
        const home = carousel(visitor);
        // The test installs reach no outside address: the slide button's
        // destination is a routed stand-in that answers as example.org.
        await visitor.route('https://example.org/**', (route) =>
            route.fulfill({status: 200, contentType: 'text/html', body: '<html><body>example.org stand-in</body></html>'})
        );

        // The first slide: the carousel is the first block under the
        // header with the first highlight, the arrows and three dots;
        // "Previous slide" is disabled (Rules 2, 4).
        await gotoHome(visitor, tag);
        await expect(home.block).toBeVisible();
        await expect(home.pageBlocks.first()).toHaveClass(/highlights/);
        await expect(home.heading).toHaveText('Highlights');
        await expect(home.slides).toHaveCount(3);
        const first = home.activeSlide;
        await expect(home.titleOf(first)).toHaveText('Call for papers');
        await expect(home.descriptionOf(first)).toHaveText('Submissions open until June.');
        await expect(home.buttonOf(first)).toHaveText('Read more');
        await expect(home.buttonOf(first)).toHaveAttribute('href', 'https://example.org/cfp');
        await expect(home.imageOf(first)).toHaveCount(0);
        await expect(home.prev).toBeVisible();
        await expect(home.prev).toHaveAttribute('aria-disabled', 'true');
        await expect(home.next).toBeVisible();
        await expect(home.next).not.toHaveAttribute('aria-disabled', 'true');
        await expect(home.dots).toHaveCount(3);
        await expect(home.activeDot).toHaveCount(1);
        await expect(home.dots.nth(0)).toHaveAttribute('aria-current', 'true');

        // The button: the browser goes to the address exactly as typed
        // (Actors row 4; Rule 4).
        await home.buttonOf(first).click();
        await visitor.waitForURL('https://example.org/cfp', {waitUntil: 'commit'});
        expect(visitor.url()).toBe('https://example.org/cfp');

        // The second slide: the picture described "Conference hall", the
        // headline, the description and the "Register" button; the second
        // dot is on (Rules 4, 10; A6 parked: no dot is pressed).
        await gotoHome(visitor, tag);
        await home.next.click();
        const second = home.activeSlide;
        await expect(home.titleOf(second)).toHaveText('Annual conference');
        await expect(second).toHaveClass(/-has-image/);
        await expect(home.imageOf(second)).toHaveAttribute('alt', 'Conference hall');
        await expect(home.descriptionOf(second)).toHaveText('Programme and registration.');
        await expect(home.buttonOf(second)).toHaveText('Register');
        await expect(home.buttonOf(second)).toHaveAttribute('href', 'https://example.org/conference');
        await expect(home.dots.nth(1)).toHaveAttribute('aria-current', 'true');
        await expect(home.dots.nth(0)).not.toHaveAttribute('aria-current', 'true');
        await expect(home.prev).not.toHaveAttribute('aria-disabled', 'true');

        // The last slide: headline and "Browse" only, no description;
        // "Next slide" disabled, "Previous slide" not (Fields; Rule 4).
        await home.next.click();
        const last = home.activeSlide;
        await expect(home.titleOf(last)).toHaveText('New book series');
        await expect(home.buttonOf(last)).toHaveText('Browse');
        await expect(home.buttonOf(last)).toHaveAttribute('href', 'https://example.org/books');
        // The template prints the description's element for every slide;
        // with none entered it is empty.
        await expect(home.descriptionOf(last)).toHaveText(/^\s*$/);
        await expect(home.imageOf(last)).toHaveCount(0);
        await expect(home.next).toHaveAttribute('aria-disabled', 'true');
        await expect(home.prev).not.toHaveAttribute('aria-disabled', 'true');
        await expect(home.dots.nth(2)).toHaveAttribute('aria-current', 'true');

        // Control: the seeded server's home page shows none of these
        // slides (Rule 1); the scratch server's carousel above is the
        // positive read.
        await gotoHome(visitor, SERVER, 'en');
        await expect(visitor.locator('.pkp_structure_main')).toContainText(/./);
        await expect(home.block).toHaveCount(0);
        await expect(visitor.getByText('Call for papers')).toHaveCount(0);
    });

    test('S4: highlights in a second language', async ({browser, baseURL, asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const manager = `${tag}mg`;
        await opsApi.createContext({
            tag,
            context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            users: [account(tag, 'mg', 'Mona', 'Manager', 'manager')],
        });
        const page = await (await asUser(manager)).newPage();
        const visitor = await (await signedOut(browser, baseURL)).newPage();
        const tab = new HighlightsTab(page, tag);
        const home = carousel(visitor);
        await tab.goto();
        await tab.addHighlight({title: 'Call for papers', url: 'https://example.org/cfp', label: 'Read more'});

        // The two-language panel: the language button shows "Title in
        // French", "Description in French" and "Button Label in French"
        // (Fields; Rule 11).
        let panel = await tab.openAdd();
        await expect(panel.titleField('fr_CA')).toBeHidden();
        await panel.localeButton('French').click();
        await expect(panel.titleField('fr_CA')).toBeVisible();
        await expect(panel.label(panel.titleField('fr_CA'))).toContainText('Title in French');
        await expect(panel.label(panel.descriptionField('fr_CA'))).toContainText('Description in French');
        await expect(panel.label(panel.buttonLabelField('fr_CA'))).toContainText('Button Label in French');
        await expect(panel.buttonLabelInput('fr_CA')).toBeVisible();

        // A French-only save refused: "Please correct 2 errors." with the
        // message under "Title" and under "Button Label" (Fields; Rule 11).
        await panel.typeTitle('Appel à contributions', 'fr_CA');
        await panel.buttonLabelInput('fr_CA').fill('Lire');
        await panel.urlInput().fill('https://example.org/appel');
        await panel.saveRefused('Please correct 2 errors.');
        await expect(panel.fieldError(panel.titleField())).toHaveText(REQUIRED);
        await expect(panel.fieldError(panel.buttonLabelField())).toHaveText(REQUIRED);
        await expect(panel.fieldError(panel.urlField())).toHaveCount(0);

        // Saved in both languages: "Second call" is the last row (Rules 5, 11).
        await panel.typeTitle('Second call');
        await panel.buttonLabelInput().fill('Read on');
        await expect(panel.saveButton()).toBeEnabled();
        await panel.save();
        await expect(tab.row('Second call')).toBeVisible();
        await expect(tab.rows()).toHaveCount(2);
        expect(await tab.rowTitles()).toEqual(['Call for papers', 'Second call']);

        // The list in French: the side tab reads "En vedette" instead of
        // "Highlights" (goto opens it by that name); the rows read "Call for
        // papers" and "Appel à contributions" (Rule 11).
        await tab.goto({locale: 'fr_CA'});
        await expect(tab.sideTab('en')).toHaveCount(0);
        await expect(tab.rows()).toHaveCount(2);
        expect(await tab.rowTitles()).toEqual(['Call for papers', 'Appel à contributions']);

        // The slides in French: one slide in its primary-language text, the
        // other in French (Rule 11).
        await gotoHome(visitor, tag, 'fr_CA');
        await expect(home.slides).toHaveCount(2);
        expect(await home.titles()).toEqual(['Call for papers', 'Appel à contributions']);
        await expect(home.buttonOf(home.slide(0))).toHaveText('Read more');
        await expect(home.buttonOf(home.slide(1))).toHaveText('Lire');

        // Control: signed out, the English home page shows "Second call"
        // with "Read on" (Rule 11).
        await gotoHome(visitor, tag, 'en');
        await expect(home.slides).toHaveCount(2);
        expect(await home.titles()).toEqual(['Call for papers', 'Second call']);
        await expect(home.buttonOf(home.slide(1))).toHaveText('Read on');

        // An edit emptying the primary language is refused with "You must
        // complete this field in English." under "Title" (Fields "Title").
        await tab.goto({locale: 'en'});
        panel = await tab.openEdit('Second call');
        expect(await panel.titleText()).toBe('Second call');
        await panel.typeTitle('');
        await panel.saveRefused('Please correct one error.');
        await expect(panel.fieldError(panel.titleField())).toHaveText('You must complete this field in English.');
        await expect(panel.fieldError(panel.buttonLabelField())).toHaveCount(0);
    });
});
