// @ts-check
/**
 * @file playwright/tests/U11-highlights.spec.js
 *
 * Highlights — OMP suite: one test per canonical scenario (S1–S4, all
 * common; the feature has no press-only scenario), in the press's own
 * vocabulary: Press Manager, Series editor, the press home page, the
 * Website settings at `/index.php/<press>/management/settings/website`.
 * Spec: docs/specs/U11-highlights.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 🐞
 * (S2 never presses ordering mode's "Cancel"), A3 🐞 (no title carries
 * formatting), A4 🐞 (S1 closes the "Edit Highlight" panel only with
 * "Save"), A5 🐞 (the site's Highlights tab and the site's carousel are
 * out of the suite: nothing seeds or asserts a site highlight), A7 🐞
 * (S4 reaches the Highlights side tab by its id, never by its French
 * label, and reads the French carousel's arrows by class, never by their
 * names), A2 ❓ (every "URL" typed is a full web address), A6 ❓ (S3 reads
 * which dot is on and never presses one), A8 ❓ (S2 never enters ordering
 * mode on an empty list), A9 ❓ (S1 removes the picture on the edit and
 * never replaces it). The spec's Coverage section records everything
 * else left out.
 *
 * Seeding: scenario endpoints only. Every scenario runs on its own
 * scratch press with throwaway accounts whose addresses carry app + test
 * (u11s1ompw0…@mail.test), because a highlight changes the press home
 * page and publicknowledge keeps its defaults (A1, A7). There is no
 * highlight seed key: the panel IS the surface under test, so every
 * highlight is added through it (footnotes s1–s4). S4's press is seeded
 * with French under "UI" and "Forms" through the context passthroughs
 * `supportedLocales` and `supportedFormLocales` (footnote s4); no test
 * drives the Languages screen. Signed-out reads run in a second browser
 * context with an empty storage state (patterns.md parallel lesson 8).
 * The slide's picture never loads on the test installs (footnote g), so
 * the suite asserts the slide's `<img>` and its alternate text, never
 * the rendered picture. Every absence is a settled read paired with a
 * positive control taken the same way: the empty home page's missing
 * carousel against the carousel once a highlight exists, the refused
 * text file's silence against the PNG's upload request, the empty Tasks
 * panel against the panel once a seeded submission raises a task, the
 * mailbox silence bounded by a discussion email the test itself sends
 * to a throwaway author (A8, `pkpMail.expectNone`), the access-denied
 * page for the roles below the manager level against the manager's own
 * tab at the same address. Waits are event-based (highlights API
 * responses, the temporary-file upload, web-first assertions) — no
 * hard-coded sleeps. Everything runs in the parallel `omp` project.
 */
const path = require('node:path');
const fs = require('node:fs/promises');
const {test: base, expect} = require('../support/fixtures.js');
const {HighlightsTab, HomeCarousel, websiteSettingsUrl} = require('../pages/HighlightsPages.js');
const {TasksPanel} = require('../../../../shared/playwright/pages/NotificationsPages.js');

const PK = 'publicknowledge';
const PK_PREFIX = '/en';
const PNG = path.resolve(__dirname, '../fixtures/files/profile-image-400.png');
const ACCESS_DENIED = 'The current role does not have access to this operation.';
const REQUIRED = 'This field is required.';
const REQUIRED_IN_ENGLISH = 'You must complete this field in English.';
const REFUSED_TYPE = "You can't upload files of this type.";
const PREVIEW_TEXT = 'Preview of the currently selected image.';
const CFP = {
    title: 'Call for papers',
    description: 'Submissions open until June.',
    url: 'https://example.org/cfp',
    buttonLabel: 'Read more',
};
const CONFERENCE = {
    title: 'Annual conference',
    description: 'Programme and registration.',
    url: 'https://example.org/conference',
    buttonLabel: 'Register',
};
const CONFERENCE_ALT = 'Conference hall';
const BOOKS = {title: 'New book series', url: 'https://example.org/books', buttonLabel: 'Browse'};

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
    return `u11${scenario}ompw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
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

/** The press home page URL of the seeded press (bilingual → /en prefix). */
function pkHome() {
    return `/index.php/${PK}${PK_PREFIX}`;
}

/**
 * Add a discussion on the open workflow's stage panel with one participant
 * ticked (the participant gets the "new discussion" email: the mailbox
 * bullet's positive control, A8). U43's shape.
 */
async function addDiscussion(page, {name, participantUsername, message}) {
    const panel = page.locator('[data-cy="discussion-manager"]').first();
    await expect(panel.getByRole('heading', {name: /Tasks & Discussions$/})).toBeVisible({
        timeout: 30_000,
    });
    await panel.getByRole('button', {name: 'Add', exact: true}).click();
    const modal = page
        .locator('[data-cy="active-modal"]')
        .filter({has: page.locator('input[name="title"]')});
    await modal.locator('input[name="title"]').fill(name);
    const participantBox = modal.getByRole('checkbox', {name: new RegExp(participantUsername)});
    await expect(participantBox).toBeVisible({timeout: 30_000});
    await participantBox.check();
    const body = modal.frameLocator('iframe').first().locator('body');
    await body.click();
    await body.fill(message);
    const saved = page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/submissions\/\d+\/tasks$/.test(r.url()),
        {timeout: 30_000}
    );
    await modal.getByRole('button', {name: 'Save', exact: true}).click();
    const response = await saved;
    expect(response.ok(), `discussion save answered ${response.status()}`).toBe(true);
    await expect(modal).toHaveCount(0, {timeout: 30_000});
}

/** Open the press's Website settings › Setup › Highlights as `page`'s user. */
async function openHighlights(page, contextPath, {locale = 'en'} = {}) {
    const tab = new HighlightsTab(page);
    await tab.goto(contextPath, {locale});
    return tab;
}

test.describe('Highlights (U11)', () => {
    test('S1: add, edit and delete a highlight', {tag: ['@smoke']}, async ({asUser, ompApi, pkpMail, visitor}, testInfo) => {
        test.setTimeout(420_000);
        const tag = makeTag('s1', testInfo);
        const manager = scratchUser(tag, 'mg', 'Mona', 'Manager', ['manager']);
        const seriesEditor = scratchUser(tag, 'se', 'Sela', 'Series', ['sectionEditor']);
        const author = scratchUser(tag, 'au', 'Ada', 'Author', ['author']);
        const reader = scratchUser(tag, 'rd', 'Rosa', 'Reader', ['reader']);
        await ompApi.createContext({tag, users: [manager, seriesEditor, author, reader]});

        const page = await (await asUser(manager.username)).newPage();
        const tab = await openHighlights(page, tag);
        const home = new HomeCarousel(visitor);

        // The empty list: "No items found." with "Order" and "Add Highlight"
        // above it; signed out, the home page carries no carousel (the
        // page's content block is the settled read; Rules 3, 5, 9).
        await expect(tab.noItems()).toBeVisible();
        await expect(tab.orderButton()).toBeVisible();
        await expect(tab.addButton()).toBeVisible();
        await expect(tab.rows()).toHaveCount(0);
        await home.goto(tag);
        await expect(home.block()).toHaveCount(0);

        // An empty save: the five fields, none marked required; "Save" with
        // nothing filled is refused in place with the three "Go to …"
        // buttons, "Jump to next error", the message under each of the
        // three fields, and "Save" grayed out (Fields).
        let panel = await tab.openAdd();
        await expect(panel.label(panel.titleField())).toHaveText('Title');
        await expect(panel.label(panel.descriptionField())).toHaveText('Description');
        await expect(panel.label(panel.urlField())).toHaveText('URL');
        await expect(panel.label(panel.buttonLabelField())).toHaveText('Button Label');
        await expect(panel.label(panel.imageField())).toHaveText('Image');
        await expect(panel.requiredMarkers()).toHaveCount(0);
        await panel.saveRefused('Please correct 3 errors.');
        const summary = panel.errorSummary();
        await expect(summary.getByRole('button', {name: `Go to Title: ${REQUIRED}`, exact: true})).toBeVisible();
        await expect(summary.getByRole('button', {name: `Go to URL: ${REQUIRED}`, exact: true})).toBeVisible();
        await expect(summary.getByRole('button', {name: `Go to Button Label: ${REQUIRED}`, exact: true})).toBeVisible();
        await expect(summary.getByRole('button', {name: 'Jump to next error', exact: true})).toBeVisible();
        await expect(panel.fieldError(panel.titleField())).toHaveText(REQUIRED);
        await expect(panel.fieldError(panel.urlField())).toHaveText(REQUIRED);
        await expect(panel.fieldError(panel.buttonLabelField())).toHaveText(REQUIRED);
        await expect(panel.fieldError(panel.descriptionField())).toHaveCount(0);
        await expect(panel.fieldError(panel.imageField())).toHaveCount(0);
        await expect(panel.saveButton()).toBeDisabled();

        // The first highlight: the four text fields, no image, "Save": the
        // panel closes and "Call for papers" is the only row, with no
        // reload (a window marker set before the save survives it); signed
        // out, the slide is the first block under the header, alone,
        // without arrows or a dot (Rules 2, 4, 5, 14).
        await panel.fill(CFP);
        await expect(panel.saveButton()).toBeEnabled();
        await page.evaluate(() => {
            // @ts-ignore a marker on the window the save must not reload away
            window.__u11NoReload = true;
        });
        await panel.save();
        await expect(tab.titles()).toHaveText([CFP.title]);
        // @ts-ignore the marker
        expect(await page.evaluate(() => window.__u11NoReload)).toBe(true);
        await home.goto(tag);
        await expect(home.block()).toHaveCount(1);
        await expect(home.firstBlock()).toHaveClass(/highlights/);
        await expect(home.slides()).toHaveCount(1);
        let slide = home.slide(CFP.title);
        await expect(home.title(slide)).toHaveText(CFP.title);
        await expect(home.description(slide)).toHaveText(CFP.description);
        await expect(home.button(slide)).toHaveText(CFP.buttonLabel);
        await expect(home.prev()).toBeHidden();
        await expect(home.next()).toBeHidden();
        await expect(home.pagination()).toBeHidden();

        // The second highlight, with a picture: a text file is refused in
        // the box and nothing is sent (the refusal is the settled read;
        // the PNG's upload request is the control); the PNG shows a
        // preview (its description is "Preview of the currently selected
        // image.") and an "Alternate text" box (Fields; Rules 4, 5, 10).
        const notes = testInfo.outputPath('notes.txt');
        await fs.writeFile(notes, `Notes for ${tag}\n`);
        let uploads = 0;
        page.on('request', (request) => {
            if (/temporaryFiles/.test(request.url()) && request.method() === 'POST') {
                uploads += 1;
            }
        });
        panel = await tab.openAdd();
        await panel.fill(CONFERENCE);
        await panel.dropRefusedFile(notes, REFUSED_TYPE);
        await expect(panel.preview()).toHaveCount(0);
        expect(uploads).toBe(0);
        // The refused file is listed in the box with "Remove file", and the
        // panel counts the refusal as a form error: "Please correct one
        // error." with its "Go to Image: …" button and "Jump to next
        // error" above "Save", "Save" and "Upload File" grayed out.
        await expect(panel.imageField().getByText('notes.txt')).toBeVisible();
        await expect(panel.imageField().getByText('Remove file').first()).toBeVisible();
        await expect(panel.errorSummary()).toContainText('Please correct one error.');
        await expect(panel.errorSummary().getByRole('button', {name: `Go to Image: ${REFUSED_TYPE}`, exact: true})).toBeVisible();
        await expect(panel.errorSummary().getByRole('button', {name: 'Jump to next error', exact: true})).toBeVisible();
        await expect(panel.saveButton()).toBeDisabled();
        await expect(panel.imageField().getByRole('button', {name: 'Upload File', exact: true})).toBeDisabled();
        await panel.uploadImage(PNG);
        expect(uploads).toBe(1);
        // The picture clears both messages; the refused name stays listed.
        await expect(panel.errorSummary()).toHaveCount(0);
        await expect(panel.fieldError(panel.imageField())).toHaveCount(0);
        await expect(panel.preview()).toHaveAttribute('alt', PREVIEW_TEXT);
        await expect(panel.altTextInput()).toBeVisible();
        await expect(panel.imageField().getByText('notes.txt')).toBeVisible();
        await expect(panel.imageField().getByText('Remove file').first()).toBeVisible();
        await panel.altTextInput().fill(CONFERENCE_ALT);
        await panel.save();
        await expect(tab.titles()).toHaveText([CFP.title, CONFERENCE.title]);
        await home.goto(tag);
        await expect(home.titles()).toHaveText([CFP.title, CONFERENCE.title]);
        await expect(home.prev()).toBeVisible();
        await expect(home.next()).toBeVisible();
        await expect(home.pagination()).toBeVisible();
        await expect(home.dots()).toHaveCount(2);
        slide = home.slide(CONFERENCE.title);
        await expect(home.image(slide)).toHaveCount(1);
        await expect(home.image(slide)).toHaveAttribute('alt', CONFERENCE_ALT);
        await expect(home.image(home.slide(CFP.title))).toHaveCount(0);

        // Edit: the panel opens filled, the picture previewed; "Remove"
        // clears it, "Restore Original" brings it back, "Remove" again,
        // a new title, "Save": the row reads the new title in place and
        // the slide is text-only (Fields; Rules 6, 10).
        panel = await tab.openEdit(CONFERENCE.title);
        expect(await panel.readRich('title')).toBe(CONFERENCE.title);
        expect(await panel.readRich('description')).toBe(CONFERENCE.description);
        await expect(panel.urlInput()).toHaveValue(CONFERENCE.url);
        await expect(panel.buttonLabelInput()).toHaveValue(CONFERENCE.buttonLabel);
        await expect(panel.preview()).toHaveCount(1);
        await expect(panel.altTextInput()).toHaveValue(CONFERENCE_ALT);
        await panel.removeImageButton().click();
        await expect(panel.preview()).toHaveCount(0);
        await panel.restoreImageButton().click();
        await expect(panel.preview()).toHaveCount(1);
        await panel.removeImageButton().click();
        await expect(panel.preview()).toHaveCount(0);
        const edited = `${CONFERENCE.title} 2027`;
        await panel.typeRich('title', edited);
        await panel.save();
        await expect(tab.titles()).toHaveText([CFP.title, edited]);
        await home.goto(tag);
        await expect(home.titles()).toHaveText([CFP.title, edited]);
        await expect(home.image(home.slide(edited))).toHaveCount(0);
        await expect(home.description(home.slide(edited))).toHaveText(CONFERENCE.description);

        // Delete: the dialog's sentence with "Yes" and "No"; "No" keeps the
        // row, "Yes" removes it; signed out, "Call for papers" is alone
        // again (Rules 4, 8).
        await tab.openDelete(edited);
        await expect(tab.deleteDialog()).toContainText(
            `Are you sure you want to delete ${edited}? This action can not be undone.`
        );
        await expect(tab.deleteDialog().getByRole('button', {name: 'Yes', exact: true})).toBeVisible();
        await expect(tab.deleteDialog().getByRole('button', {name: 'No', exact: true})).toBeVisible();
        await tab.answerDelete('No');
        await expect(tab.titles()).toHaveText([CFP.title, edited]);
        await tab.openDelete(edited);
        await tab.answerDelete('Yes');
        await expect(tab.titles()).toHaveText([CFP.title]);
        await home.goto(tag);
        await expect(home.titles()).toHaveText([CFP.title]);
        await expect(home.prev()).toBeHidden();
        await expect(home.next()).toBeHidden();
        await expect(home.pagination()).toBeHidden();

        // Nothing else happens: the header's Tasks panel holds no task
        // after the saves and deletes (control: a seeded submission
        // raises one, read the same way); no email arrived for the
        // manager, the series editor or the reader, bounded by a
        // discussion email the manager sends to the author (Side effects).
        const tasks = new TasksPanel(page);
        await page.reload();
        await tab.openTab();
        await tasks.expectCount(0);
        await tasks.open();
        await expect(tasks.rows()).toHaveCount(0);
        await expect(tasks.noItems()).toBeVisible();
        await tasks.close();
        const {submissionId} = await ompApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author.username,
            title: `Submission ${tag}`,
        });
        await page.reload();
        await tasks.expectCount(1);
        await tasks.open();
        await expect(tasks.rows()).toHaveCount(1);
        await tasks.close();
        const discussion = `Control ${tag}`;
        await page.goto(`/index.php/${tag}/dashboard/editorial?workflowSubmissionId=${submissionId}`);
        await addDiscussion(page, {
            name: discussion,
            participantUsername: author.username,
            message: `Control message ${tag}.`,
        });
        // The discussion's email goes to its participants, the author and
        // the manager who opened it: the manager's box holds that one
        // message and nothing else, the series editor's and the reader's
        // nothing at all.
        await pkpMail.find({to: author.email, subject: discussion});
        await pkpMail.find({to: manager.email, subject: discussion});
        expect(await pkpMail.count({to: manager.email})).toBe(1);
        for (const to of [seriesEditor.email, reader.email]) {
            await pkpMail.expectNone({to, afterControl: {to: author.email, subject: discussion}});
        }

        // Control: the series editor, the author and the reader each get
        // the access-denied page at the address the manager used, and no
        // list panel (Actors row 1).
        for (const user of [seriesEditor, author, reader]) {
            const other = await (await asUser(user.username)).newPage();
            await other.goto(websiteSettingsUrl(tag));
            await expect(other.getByText(ACCESS_DENIED)).toBeVisible({timeout: 30_000});
            await expect(other.locator('.highlightsListPanel')).toHaveCount(0);
            await expect(other.locator('#setup-button')).toHaveCount(0);
        }
    });

    test('S2: reorder the highlights', async ({asUser, ompApi, visitor}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s2', testInfo);
        const manager = scratchUser(tag, 'mg', 'Mona', 'Manager', ['manager']);
        await ompApi.createContext({tag, users: [manager]});

        const page = await (await asUser(manager.username)).newPage();
        const tab = await openHighlights(page, tag);
        const home = new HomeCarousel(visitor);
        const titles = ['First', 'Second', 'Third'];
        for (const title of titles) {
            await tab.add({title, url: `https://example.org/${title.toLowerCase()}`, buttonLabel: 'Open'});
        }
        await expect(tab.titles()).toHaveText(titles);

        // Control: before "Save Order", signed out, the slides come in the
        // order they were added (Rules 4, 5).
        await home.goto(tag);
        await expect(home.titles()).toHaveText(titles);

        // Ordering mode: "Order" gives way to "Save Order" and "Cancel",
        // "Add Highlight" is grayed out, each row's "Edit" and "Delete"
        // give way to an up and a down arrow (Rule 9).
        await tab.enterOrdering();
        await expect(tab.cancelOrderButton()).toBeVisible();
        await expect(tab.orderButton()).toHaveCount(0);
        await expect(tab.addButton()).toBeDisabled();
        for (const title of titles) {
            await expect(tab.editButton(title)).toHaveCount(0);
            await expect(tab.deleteButton(title)).toHaveCount(0);
            await expect(tab.upArrow(title)).toBeVisible();
            await expect(tab.downArrow(title)).toBeVisible();
        }

        // The ends: the first row's up arrow and the last row's down arrow
        // move nothing (Rule 9).
        await tab.upArrow('First').click();
        await tab.downArrow('Third').click();
        await expect(tab.titles()).toHaveText(titles);

        // A move saved: "Third" up twice, "Save Order": ordering mode
        // ends with the rows still moved; a reload shows the same order;
        // signed out, the slides follow it as "Next slide" walks them
        // (Rules 4, 9, 9a).
        const moved = ['Third', 'First', 'Second'];
        await tab.upArrow('Third').click();
        await expect(tab.titles()).toHaveText(['First', 'Third', 'Second']);
        await tab.upArrow('Third').click();
        await expect(tab.titles()).toHaveText(moved);
        await tab.saveOrder();
        await expect(tab.saveOrderButton()).toHaveCount(0);
        await expect(tab.cancelOrderButton()).toHaveCount(0);
        await expect(tab.addButton()).toBeEnabled();
        for (const title of titles) {
            await expect(tab.editButton(title)).toBeVisible();
            await expect(tab.deleteButton(title)).toBeVisible();
        }
        await expect(tab.titles()).toHaveText(moved);
        await tab.goto(tag);
        await expect(tab.titles()).toHaveText(moved);
        await home.goto(tag);
        await expect(home.titles()).toHaveText(moved);
        await expect(home.title(home.activeSlide())).toHaveText('Third');
        await home.goNext('First');
        await home.goNext('Second');

        // A new highlight after a saved order: "Fourth" is the last row,
        // under "Second", and the last slide (Rules 5, 7).
        await tab.add({title: 'Fourth', url: 'https://example.org/fourth', buttonLabel: 'Open'});
        await expect(tab.titles()).toHaveText([...moved, 'Fourth']);
        await home.goto(tag);
        await expect(home.titles()).toHaveText([...moved, 'Fourth']);
    });

    test('S3: read the carousel as a visitor', async ({asUser, ompApi, visitor}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s3', testInfo);
        const manager = scratchUser(tag, 'mg', 'Mona', 'Manager', ['manager']);
        await ompApi.createContext({tag, users: [manager]});

        // The given: three highlights added through the panel, the second
        // with the picture and its alternate text, the third with no
        // description (footnote s3).
        const page = await (await asUser(manager.username)).newPage();
        const tab = await openHighlights(page, tag);
        await tab.add(CFP);
        let panel = await tab.openAdd();
        await panel.fill(CONFERENCE);
        await panel.uploadImage(PNG);
        await panel.altTextInput().fill(CONFERENCE_ALT);
        await panel.save();
        await tab.add(BOOKS);
        await expect(tab.titles()).toHaveText([CFP.title, CONFERENCE.title, BOOKS.title]);

        // The first slide: the carousel is the first block under the
        // header, "Call for papers" on, the two arrows and three dots,
        // "Previous slide" disabled (Rules 2, 4).
        const home = new HomeCarousel(visitor);
        await home.goto(tag);
        await expect(home.firstBlock()).toHaveClass(/highlights/);
        await expect(home.heading()).toHaveText('Highlights');
        await expect(home.slides()).toHaveCount(3);
        let slide = home.activeSlide();
        await expect(home.title(slide)).toHaveText(CFP.title);
        await expect(home.description(slide)).toHaveText(CFP.description);
        await expect(home.button(slide)).toHaveText(CFP.buttonLabel);
        await expect(home.prev()).toBeVisible();
        await expect(home.next()).toBeVisible();
        await expect(home.prev()).toHaveAccessibleName('Previous slide');
        await expect(home.next()).toHaveAccessibleName('Next slide');
        await expect(home.dots()).toHaveCount(3);
        await expect(home.prev()).toHaveAttribute('aria-disabled', 'true');
        await expect(home.next()).toHaveAttribute('aria-disabled', 'false');
        await expect(home.dots().nth(0)).toHaveClass(/swiper-pagination-bullet-active/);

        // The button: its link is the address exactly as typed, and
        // pressing it takes the browser there (the outside address is
        // answered by a stub, since the test installs reach none; Actors
        // row 4; Rule 4).
        await expect(home.button(slide)).toHaveAttribute('href', CFP.url);
        await visitor.route('https://example.org/**', (route) =>
            route.fulfill({status: 200, contentType: 'text/html', body: '<html><body>stub</body></html>'})
        );
        await home.button(slide).click();
        await expect(visitor).toHaveURL(CFP.url);
        await visitor.unroute('https://example.org/**');

        // The second slide: "Next slide" shows the picture with its
        // description, the headline, the text and "Register"; the second
        // dot is the one on (Rules 4, 10).
        await home.goto(tag);
        await home.goNext(CONFERENCE.title);
        slide = home.activeSlide();
        await expect(home.image(slide)).toHaveCount(1);
        await expect(home.image(slide)).toHaveAttribute('alt', CONFERENCE_ALT);
        await expect(home.description(slide)).toHaveText(CONFERENCE.description);
        await expect(home.button(slide)).toHaveText(CONFERENCE.buttonLabel);
        await expect(home.button(slide)).toHaveAttribute('href', CONFERENCE.url);
        await expect(home.dots().nth(1)).toHaveClass(/swiper-pagination-bullet-active/);
        await expect(home.dots().nth(0)).not.toHaveClass(/swiper-pagination-bullet-active/);
        await expect(home.prev()).toHaveAttribute('aria-disabled', 'false');

        // The last slide: headline and "Browse" only, no description (the
        // theme prints an empty description block; the earlier slides'
        // filled ones are the control); "Next slide" is disabled and
        // "Previous slide" is not (Fields "Description"; Rule 4).
        await home.goNext(BOOKS.title);
        slide = home.activeSlide();
        await expect(home.button(slide)).toHaveText(BOOKS.buttonLabel);
        await expect(home.button(slide)).toHaveAttribute('href', BOOKS.url);
        await expect(home.description(slide)).toHaveText('');
        await expect(home.image(slide)).toHaveCount(0);
        await expect(home.next()).toHaveAttribute('aria-disabled', 'true');
        await expect(home.prev()).toHaveAttribute('aria-disabled', 'false');
        await expect(home.dots().nth(2)).toHaveClass(/swiper-pagination-bullet-active/);

        // Control: the seeded press's home page shows none of the three
        // slides (Rule 1).
        await visitor.goto(pkHome());
        await expect(home.pageBlock()).toBeAttached({timeout: 30_000});
        for (const title of [CFP.title, CONFERENCE.title, BOOKS.title]) {
            await expect(home.slide(title)).toHaveCount(0);
        }
    });

    test('S4: highlights in a second language', async ({asUser, ompApi, visitor}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        const manager = scratchUser(tag, 'mg', 'Mona', 'Manager', ['manager']);
        await ompApi.createContext({
            tag,
            context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            users: [manager],
        });
        const FR = 'fr_CA';
        const APPEL = 'Appel à contributions';

        // The given: "Call for papers" entered in English only.
        const page = await (await asUser(manager.username)).newPage();
        const tab = await openHighlights(page, tag);
        await tab.add({title: CFP.title, url: CFP.url, buttonLabel: CFP.buttonLabel});

        // The two-language panel: the language button shows "Title in
        // French", "Description in French" and "Button Label in French"
        // (Fields; Rule 11).
        let panel = await tab.openAdd();
        await expect(panel.titleField(FR)).toBeHidden();
        await panel.localeToggle('French').click();
        await expect(panel.titleField(FR)).toBeVisible();
        await expect(panel.label(panel.titleField(FR))).toContainText('Title in French');
        await expect(panel.descriptionField(FR)).toBeVisible();
        await expect(panel.label(panel.descriptionField(FR))).toContainText('Description in French');
        await expect(panel.buttonLabelField(FR)).toBeVisible();
        await expect(panel.label(panel.buttonLabelField(FR))).toContainText('Button Label in French');

        // A French-only save refused: "Please correct 2 errors." with the
        // message under "Title" and "Button Label", nothing under the
        // French boxes (Fields; Rule 11).
        await panel.fill({title: APPEL, buttonLabel: 'Lire', locale: FR});
        await panel.fill({url: 'https://example.org/appel'});
        await panel.saveRefused('Please correct 2 errors.');
        await expect(panel.fieldError(panel.titleField())).toHaveText(REQUIRED);
        await expect(panel.fieldError(panel.buttonLabelField())).toHaveText(REQUIRED);
        await expect(panel.fieldError(panel.titleField(FR))).toHaveCount(0);
        await expect(panel.fieldError(panel.buttonLabelField(FR))).toHaveCount(0);
        await expect(panel.fieldError(panel.urlField())).toHaveCount(0);

        // Saved in both languages: "Second call" is the last row (Rules 5, 11).
        await panel.fill({title: 'Second call', buttonLabel: 'Read on'});
        await panel.save();
        await expect(tab.titles()).toHaveText([CFP.title, 'Second call']);

        // The list in French: the rows read "Call for papers" (no French
        // title, so its primary-language one) and "Appel à contributions"
        // (Rule 11; the side tab's raw-key label, A7, is not asserted: the
        // tab is reached by its id).
        await tab.goto(tag, {locale: FR});
        await expect(tab.titles()).toHaveText([CFP.title, APPEL]);

        // The slides in French: signed out, one slide in its
        // primary-language text and the other in French (Rule 11).
        const home = new HomeCarousel(visitor);
        await home.goto(tag, {locale: FR});
        await expect(home.titles()).toHaveText([CFP.title, APPEL]);
        await expect(home.button(home.slide(CFP.title))).toHaveText(CFP.buttonLabel);
        await expect(home.button(home.slide(APPEL))).toHaveText('Lire');

        // An edit emptying the primary language: with "/en" back in the
        // address, "Title" cleared on "Second call" is refused with "You
        // must complete this field in English." (Fields "Title").
        await tab.goto(tag, {locale: 'en'});
        panel = await tab.openEdit('Second call');
        expect(await panel.readRich('title')).toBe('Second call');
        await panel.typeRich('title', '');
        await panel.saveRefused('Please correct one error.');
        await expect(panel.fieldError(panel.titleField())).toHaveText(REQUIRED_IN_ENGLISH);
        await panel.close();

        // Control: signed out, the home page in English shows "Second
        // call" with the button "Read on" (Rule 11).
        await home.goto(tag, {locale: 'en'});
        await expect(home.titles()).toHaveText([CFP.title, 'Second call']);
        await expect(home.button(home.slide('Second call'))).toHaveText('Read on');
    });
});
