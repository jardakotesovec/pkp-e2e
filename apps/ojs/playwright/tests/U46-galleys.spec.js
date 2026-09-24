// @ts-check
/**
 * @file playwright/tests/U46-galleys.spec.js
 *
 * Galleys — OJS suite, one test per canonical scenario the spec runs on
 * OJS (S1–S3 common; S4 {OJS}; S5 is the press's, in the OMP tree; S6–S8
 * the preprint server's, in the OPS tree).
 * Spec: docs/specs/U46-galleys.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A1 🐞: the "Edit" window is found by its title, which nothing asserts.
 * - A3 🐞: the remote galley's menu is read for "Edit" and the absence of
 *   "More Information" only; its "Change File" is not asserted.
 * - A5 🐞: the ordering arrows are pressed by position; their names are
 *   never read.
 * - A7 🐞: no list order is read before an order is saved; S2 reads the
 *   order it finds on entering ordering mode and moves from there.
 * - A4, A6, OJS1: not on these scenarios' paths (S3 deletes the new
 *   version's copy, never the published galley, and changes no file
 *   there). OPS1–OPS3: the preprint server's, in that tree.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only. S1 runs on publicknowledge on its own scratch submission
 * (`manager.maya`, submitter `author.alex`); S2–S4 run on scratch journals
 * with throwaway accounts (the username twice as password), as footnote s
 * says: `context.supportedSubmissionLocales` (S2, S3), the submission's
 * `galleys[]`, `decisions`, `published` with the journal's `issues[]` (S3)
 * and `participants[]` with `canChangeMetadata` (S4). No key sets a URL
 * Path or makes a second version: S3 types the path and uses "Create New
 * Version" (U49's opener, which waits for the version to load).
 *
 * Every absence is read settled and paired with a positive control taken
 * the same way (M4, M6); S2's mailbox silence is bounded by a "Notify" the
 * test sends to a spare account of its own journal (A8). Browser dialogs
 * are recorded and answered on every page (the window's "The data on this
 * form has changed…" question). Waits are web-first or bounded by the
 * screen's own answer (A5). Everything runs in the parallel `ojs` project.
 */
const path = require('path');
const {test, expect} = require('../support/fixtures.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {ActivityLogWindow} = require('../../../../shared/playwright/pages/ActivityLogPages.js');
const {recordBrowserDialogs} = require('../../../../shared/playwright/pages/SubmissionFilesPages.js');
const {
    GALLEYS_TEXT: TEXT,
    GalleyManager,
    galleyUploadWizard,
    readerGalleyLinks,
} = require('../../../../shared/playwright/pages/GalleysPages.js');
const {PublicationScreen} = require('../pages/PublicationMetadataPages.js');
const {PublishScreen} = require('../pages/PublishSchedulePages.js');

const JOURNAL = 'publicknowledge';
const MANAGER = 'manager.maya';
const AUTHOR = 'author.alex';
const COMPONENT = 'Article Text';
const ENGLISH = 'English';
const FRENCH = 'French (Canada)';
const REMOTE_URL = 'https://example.org/paper';
const NOTIFY_SUBJECT = 'Discussion (Submission)';
const FILES = path.join(__dirname, '..', 'fixtures', 'files');
const ARTICLE_PDF = path.join(FILES, 'article.pdf');
const REPLACEMENT_PDF = path.join(FILES, 'replacement.pdf');
const MENU_FULL = ['Edit', 'Change File', 'More Information', 'Delete'];

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u46${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: mailOf(username), roles};
}

/**
 * Seed a scratch journal with a throwaway Journal Manager and Author, and
 * `extra` accounts; returns the usernames.
 */
async function seedJournal(ojsApi, tag, {extra = [], ...keys} = {}) {
    const users = [user(`${tag}mg`, 'Mona', 'Manager', ['manager']), user(`${tag}au`, 'Ada', 'Author', ['author']), ...extra];
    await ojsApi.createContext({tag, users, ...keys});
    return {manager: `${tag}mg`, author: `${tag}au`};
}

/**
 * A page as `username`: the workflow frame of `contextPath`, the Galleys
 * page object and a recorder of every browser dialog (answered "OK"
 * unless the test queues "Cancel").
 */
async function pageAs(asUser, username, contextPath) {
    const page = await (await asUser(username)).newPage();
    const frame = new WorkflowPage(page, contextPath);
    return {page, frame, galleys: new GalleyManager(page, frame), dialogs: recordBrowserDialogs(page)};
}

/** A signed-out reader page (an explicit empty state, patterns.md lesson 8). */
async function readerPage(browser, baseURL) {
    const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
    return context.newPage();
}

/** The published article's page on the journal's public site, its galley links loaded. */
async function openArticle(page, contextPath, submissionId) {
    await page.goto(`/index.php/${contextPath}/article/view/${submissionId}`);
    await expect(readerGalleyLinks(page).first()).toBeVisible({timeout: 30_000});
}

/**
 * No toast at the top right: the status area is there (its own control)
 * and holds no `.pkpNotification`.
 */
async function expectNoNotice(page) {
    await expect(page.locator('.app__notifications')).toBeAttached();
    await expect(page.locator('.app__notifications .pkpNotification')).toHaveCount(0);
}

test.describe('galleys', () => {
    test('S1: build a galley and its file', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s1', testInfo);
        const submission = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: AUTHOR,
            title: `Galleys ${tag}`,
            decisions: ['sendExternalReview'],
        });
        const {page, frame, galleys, dialogs} = await pageAs(asUser, MANAGER, JOURNAL);

        // An empty page, the article still in Review: the heading, "No
        // Items", "Add galley" and no "Order" (Fields; Rule 12).
        await galleys.open(submission.submissionId, submission.publicationId);
        await expect(frame.heading()).toHaveText('Publication: Galleys');
        await expect(galleys.tableLabel()).toBeVisible();
        await expect(galleys.noItems()).toHaveText(TEXT.noItems);
        await expect(galleys.addButton()).toBeVisible();
        await expect(galleys.orderButton()).toHaveCount(0);

        // "Create New Galley": its fields and help lines; the remote box
        // swaps the address box and "URL Path" both ways (Fields).
        let win = await galleys.openCreate();
        await expect(win.form()).toContainText(TEXT.labelHelp);
        await expect(win.selectedLocale()).toHaveText(ENGLISH);
        await expect(win.remoteBox()).not.toBeChecked();
        await expect(win.form()).toContainText(TEXT.remoteBox);
        await expect(win.urlPathBox()).toBeVisible();
        await expect(win.form()).toContainText(TEXT.urlPathHelp);
        await expect(win.remoteUrlBox()).toBeHidden();
        await win.setRemote(true);
        await expect(win.remoteUrlBox()).toBeVisible();
        await expect(win.form()).toContainText(TEXT.remoteUrl);
        await expect(win.urlPathBox()).toBeHidden();
        await win.setRemote(false);
        await expect(win.remoteUrlBox()).toBeHidden();
        await expect(win.urlPathBox()).toBeVisible();

        // "Close" and "Cancel": the header "Close" asks, "Cancel" keeps the
        // window and the text; the form's "Cancel" closes without asking
        // (Rules 2a, 6a).
        await win.type(win.labelBox(), 'Draft');
        const askedBefore = dialogs.messages.length;
        dialogs.answerNext('dismiss');
        await win.closeButton().click();
        await expect.poll(() => dialogs.messages.slice(askedBefore)).toEqual([TEXT.formChanged]);
        await expect(win.dialog()).toBeVisible();
        await expect(win.labelBox()).toHaveValue('Draft');
        await win.cancel();
        expect(dialogs.messages.slice(askedBefore)).toEqual([TEXT.formChanged]);
        await expect(galleys.noItems()).toHaveText(TEXT.noItems);

        // "Galley Label" left empty: refused under the box, nothing sent,
        // the window stays (Fields).
        win = await galleys.openCreate();
        const sent = await win.saveRefusedInBrowser();
        expect(sent).toBe(0);
        await expect(win.form()).toContainText(TEXT.required);
        await expect(win.dialog()).toBeVisible();

        // "Add galley" with a file: "Save" opens the upload wizard on its
        // component step; after "Complete" the row "PDF", "English", its
        // label downloading "article.pdf" (Rule 2; Fields, Name).
        await win.type(win.labelBox(), 'PDF');
        await win.save();
        const wizard = galleyUploadWizard(page);
        await wizard.expectOpen();
        await expect(wizard.componentSelect()).toBeVisible();
        await galleys.uploadInWizard({component: COMPONENT, file: ARTICLE_PDF, name: 'article.pdf'});
        await galleys.expectLabels(['PDF']);
        await expect(galleys.languageCell('PDF')).toHaveText(ENGLISH);
        expect(await galleys.downloadedName('PDF')).toBe('article.pdf');

        // The row menu (Fields, More Actions; Actors rows 2 and 4).
        expect(await galleys.menuOffers('PDF')).toEqual(MENU_FULL);

        // A galley left without a file: plain-text label, no "More
        // Information"; its "Change File" asks for the component again
        // (Rule 2b). The "PDF" row, read the same way, is the control.
        win = await galleys.openCreate();
        await win.type(win.labelBox(), 'HTML');
        await win.save();
        await galleys.cancelWizard();
        await expect(galleys.rows()).toHaveCount(2);
        await expect(galleys.row('HTML')).toBeVisible();
        await expect(galleys.nameLink('PDF')).toBeVisible();
        await expect(galleys.nameLink('HTML')).toHaveCount(0);
        expect(await galleys.menuOffers('HTML')).toEqual(['Edit', 'Change File', 'Delete']);
        const reopened = await galleys.openChangeFile('HTML');
        await expect(reopened.componentSelect()).toBeVisible();
        await galleys.cancelWizard();

        // "Change File": the label stays "PDF", the link downloads the new
        // file (Rule 3).
        await galleys.openChangeFile('PDF');
        await galleys.uploadInWizard({file: REPLACEMENT_PDF, name: 'replacement.pdf'});
        await expect(galleys.row('PDF')).toBeVisible();
        expect(await galleys.downloadedName('PDF')).toBe('replacement.pdf');

        // Control: "Order" now shows above the list (Fields).
        await expect(galleys.orderButton()).toBeVisible();
    });

    test('S2: edit, order and delete galleys', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s2', testInfo);
        const spare = `${tag}x`;
        const {manager, author} = await seedJournal(ojsApi, tag, {
            context: {supportedSubmissionLocales: ['en', 'fr_CA']},
            extra: [user(spare, 'Xena', 'Spare', ['author'])],
        });
        const [submission, control] = await Promise.all([
            ojsApi.createSubmission({
                tag,
                context: tag,
                submitter: author,
                galleys: [
                    {label: 'PDF', locale: 'en', file: 'article.pdf'},
                    {label: 'HTML', locale: 'en', file: 'article.html'},
                ],
            }),
            ojsApi.createSubmission({tag: `${tag}c`, context: tag, submitter: spare}),
        ]);
        const {page, frame, galleys, dialogs} = await pageAs(asUser, manager, tag);

        // The "Language" list with a second submission language (Fields,
        // Language; Settings bullet 3).
        await galleys.open(submission.submissionId, submission.publicationId);
        let win = await galleys.openEdit('PDF');
        await expect(win.labelBox()).toHaveValue('PDF');
        await expect(win.selectedLocale()).toHaveText(ENGLISH);
        expect(await win.localeOptions()).toEqual([ENGLISH, FRENCH]);

        // Leaving with unsaved changes: the header "Close" asks, "OK"
        // closes and keeps "PDF"; the form's "Cancel" closes without asking
        // (Rule 6a).
        await win.type(win.labelBox(), 'PDF draft');
        const askedBefore = dialogs.messages.length;
        await win.closeButton().click();
        await win.expectClosed();
        expect(dialogs.messages.slice(askedBefore)).toEqual([TEXT.formChanged]);
        await expect(galleys.row('PDF')).toBeVisible();
        win = await galleys.openEdit('PDF');
        await win.type(win.labelBox(), 'PDF draft');
        await win.cancel();
        expect(dialogs.messages.slice(askedBefore)).toEqual([TEXT.formChanged]);
        await expect(galleys.row('PDF')).toBeVisible();
        await expect(galleys.row('PDF draft')).toHaveCount(0);

        // Edit and save: the row reads "PDF2" and "French (Canada)" at
        // once, with no notice (Rule 6).
        win = await galleys.openEdit('PDF');
        await win.type(win.labelBox(), 'PDF2');
        await win.chooseLocale(FRENCH);
        await win.save();
        await expect(galleys.languageCell('PDF2')).toHaveText(FRENCH);
        await expect(galleys.row('PDF')).toHaveCount(0);
        await expectNoNotice(page);

        // "URL Path" refusals: each replaces the help line under the box
        // and keeps the window; "pdf_v1.x" saves (Rule 5).
        win = await galleys.openEdit('PDF2');
        await win.type(win.urlPathBox(), 'pdf');
        await win.save();
        win = await galleys.openEdit('HTML');
        for (const [value, message] of [
            ['123', TEXT.urlPathNumber],
            ['my galley', TEXT.urlPathCharacters],
            ['pdf', TEXT.urlPathUsed],
        ]) {
            await win.type(win.urlPathBox(), value);
            await win.saveRefused();
            await expect(win.form()).toContainText(message);
            await expect(win.form()).not.toContainText(TEXT.urlPathHelp);
        }
        await win.type(win.urlPathBox(), 'pdf_v1.x');
        await win.save();

        // Ordering mode: "Save Order", arrows in place of "…", no
        // "Cancel", "Add galley" still below; the first row's up arrow and
        // the last row's down arrow move nothing (Rule 8a). The order is
        // read as found (A7).
        await galleys.reload();
        await expect(galleys.rows()).toHaveCount(2);
        const before = await galleys.labels();
        expect([...before].sort()).toEqual(['HTML', 'PDF2']);
        const swapped = [before[1], before[0]];
        await galleys.startOrdering();
        await expect(galleys.orderButton()).toHaveCount(0);
        for (const label of before) {
            await expect(galleys.rowButtons(label)).toHaveCount(2);
            await expect(galleys.menuButton(label)).toHaveCount(0);
        }
        await expect(galleys.cancelButton()).toHaveCount(0);
        await expect(galleys.addButton()).toBeVisible();
        await galleys.upArrow(before[0]).click();
        await galleys.downArrow(before[1]).click();
        await galleys.expectLabels(before);

        // Leaving without saving: the swap is gone after "Title & Abstract"
        // and back (Rule 8c). The swap itself is the control.
        await galleys.downArrow(before[0]).click();
        await galleys.expectLabels(swapped);
        await frame.selectPage('Title & Abstract');
        await frame.selectPage('Galleys');
        await galleys.expectLabels(before);

        // "Save Order": back to "Order" and the "…" buttons; the order
        // holds after a reload (Rule 8b).
        await galleys.startOrdering();
        await galleys.downArrow(before[0]).click();
        await galleys.expectLabels(swapped);
        await galleys.saveOrder();
        await expect(galleys.saveOrderButton()).toHaveCount(0);
        for (const label of before) {
            await expect(galleys.menuButton(label)).toBeVisible();
        }
        await galleys.reload();
        await galleys.expectLabels(swapped);

        // "Delete", then "Cancel": the dialog's title, question and
        // buttons; the row stays (Rule 9).
        const dialog = await galleys.openDelete('HTML');
        await expect(dialog).toContainText(TEXT.deleteQuestion);
        await expect(dialog.getByRole('button', {name: 'OK', exact: true})).toBeVisible();
        await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        await galleys.cancelDelete();
        await expect(galleys.row('HTML')).toBeVisible();

        // "Delete", then "OK": the row goes, with no notice (Rule 9).
        await galleys.openDelete('HTML');
        const deleted = await galleys.confirmDelete();
        expect(deleted.status()).toBe(200);
        await expect(galleys.rows()).toHaveCount(1);
        await expect(galleys.row('HTML')).toHaveCount(0);
        await expect(galleys.row('PDF2')).toBeVisible();
        await expectNoNotice(page);

        // The Activity Log's delete line (Side effects).
        const log = new ActivityLogWindow(page, frame);
        await log.open();
        const events = (await log.historyLines()).map((line) => line.event);
        expect(events).toContain(`A file "article.html" was deleted for submission ${submission.submissionId} by ${manager}.`);
        await log.close();

        // No email about any of it: bounded by the one mail the test sends
        // itself the same way, a "Notify" to the spare (Side effects; A8).
        const notify = new PublicationScreen(page, tag);
        await notify.gotoWorkflow(control.submissionId);
        await notify.openStage('Submission');
        await notify.notifyParticipant('Xena Spare', `<p>Control ${tag}</p>`);
        const afterControl = {to: mailOf(spare), subject: NOTIFY_SUBJECT, contains: `Control ${tag}`};
        await pkpMail.expectNone({to: mailOf(author), afterControl});
        await pkpMail.expectNone({to: mailOf(manager), afterControl});

        // Control: "PDF2" still downloads "article.pdf" (Rule 9).
        await galleys.open(submission.submissionId, submission.publicationId);
        expect(await galleys.downloadedName('PDF2')).toBe('article.pdf');
    });

    test('S3: a published version\'s galleys, its readers and a new version', async ({asUser, ojsApi, browser, baseURL}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s3', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag, {
            context: {supportedSubmissionLocales: ['en', 'fr_CA']},
            issues: [{volume: 1, number: 1, year: 2026, published: true}],
        });
        const submission = await ojsApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            decisions: ['sendExternalReview', 'accept', 'sendToProduction'],
            galleys: [
                {label: 'PDF', locale: 'en', file: 'article.pdf'},
                {label: 'HTML', locale: 'fr_CA', file: 'article.html'},
                {label: 'Remote', locale: 'en', urlRemote: REMOTE_URL},
            ],
            published: true,
            issue: {volume: 1, number: 1, year: 2026},
        });
        const {page, galleys} = await pageAs(asUser, manager, tag);
        const reader = await readerPage(browser, baseURL);

        // The published version's page: "Order", "Add galley" and the full
        // menu on "PDF" (Rule 10).
        await galleys.open(submission.submissionId, submission.publicationId);
        await expect(galleys.rows()).toHaveCount(3);
        await expect(galleys.orderButton()).toBeVisible();
        await expect(galleys.addButton()).toBeVisible();
        expect(await galleys.menuOffers('PDF')).toEqual(MENU_FULL);

        // The remote galley: plain-text label and no "More Information"
        // ("PDF" the control); its "Edit" holds the ticked box and the
        // address; the box swaps the boxes and empties the address;
        // "Cancel" keeps what was saved (Rules 4, 6a; Fields).
        await expect(galleys.nameLink('PDF')).toBeVisible();
        await expect(galleys.nameLink('Remote')).toHaveCount(0);
        const remoteMenu = await galleys.menuOffers('Remote');
        expect(remoteMenu).toContain('Edit');
        expect(remoteMenu).not.toContain('More Information');
        let win = await galleys.openEdit('Remote');
        await expect(win.remoteBox()).toBeChecked();
        await expect(win.remoteUrlBox()).toHaveValue(REMOTE_URL);
        await expect(win.urlPathBox()).toBeHidden();
        await win.setRemote(false);
        await expect(win.remoteUrlBox()).toBeHidden();
        await expect(win.urlPathBox()).toBeVisible();
        await win.setRemote(true);
        await expect(win.remoteUrlBox()).toBeVisible();
        await expect(win.remoteUrlBox()).toHaveValue('');
        await win.cancel();
        win = await galleys.openEdit('Remote');
        await expect(win.remoteBox()).toBeChecked();
        await expect(win.remoteUrlBox()).toHaveValue(REMOTE_URL);
        await win.cancel();

        // A URL Path and an order on the published version (Rules 8b, 10).
        win = await galleys.openEdit('PDF');
        await win.type(win.urlPathBox(), 'pdf');
        await win.save();
        await galleys.startOrdering();
        await galleys.arrange(['Remote', 'PDF', 'HTML']);
        await galleys.saveOrder();
        await galleys.expectLabels(['Remote', 'PDF', 'HTML']);

        // The reader's page: the links in that order, the French galley's
        // language in brackets; "PDF" ends in its path, "HTML" in a number;
        // "Remote" opens the remote address (Side effects).
        await openArticle(reader, tag, submission.submissionId);
        await expect(readerGalleyLinks(reader)).toHaveText(['Remote', 'PDF', `HTML (${FRENCH})`]);
        await expect(readerGalleyLinks(reader).nth(1)).toHaveAttribute('href', /\/pdf$/);
        await expect(readerGalleyLinks(reader).nth(2)).toHaveAttribute('href', /\/\d+$/);
        await reader.context().route('https://example.org/**', (route) =>
            route.fulfill({status: 200, contentType: 'text/html', body: '<html><body>remote copy</body></html>'})
        );
        await readerGalleyLinks(reader).first().click();
        await expect(reader).toHaveURL(REMOTE_URL);

        // A change reaches readers at once (Rule 10).
        win = await galleys.openEdit('PDF');
        await win.type(win.labelBox(), 'PDF (corrected)');
        await win.save();
        await galleys.expectLabels(['Remote', 'PDF (corrected)', 'HTML']);
        await openArticle(reader, tag, submission.submissionId);
        await expect(readerGalleyLinks(reader)).toHaveText(['Remote', 'PDF (corrected)', `HTML (${FRENCH})`]);

        // The new version's copies: same labels, languages, order, remote
        // address and URL Path (Rule 11).
        const publish = new PublishScreen(page, tag);
        const versionDialog = await publish.openCreateVersionDialog();
        const newPublicationId = await publish.confirmVersionDialog(versionDialog);
        await galleys.open(submission.submissionId, newPublicationId);
        await galleys.expectLabels(['Remote', 'PDF (corrected)', 'HTML']);
        await expect(galleys.languageCell('Remote')).toHaveText(ENGLISH);
        await expect(galleys.languageCell('PDF (corrected)')).toHaveText(ENGLISH);
        await expect(galleys.languageCell('HTML')).toHaveText(FRENCH);
        win = await galleys.openEdit('Remote');
        await expect(win.remoteUrlBox()).toHaveValue(REMOTE_URL);
        await win.cancel();
        win = await galleys.openEdit('PDF (corrected)');
        await expect(win.urlPathBox()).toHaveValue('pdf');

        // Changing the copies: "PDF v2" saves with the path "pdf" the
        // published galley also has; "Remote" deleted (Rules 5, 11).
        await win.type(win.labelBox(), 'PDF v2');
        await win.save();
        await expect(galleys.row('PDF v2')).toBeVisible();
        await galleys.openDelete('Remote');
        expect((await galleys.confirmDelete()).status()).toBe(200);
        await galleys.expectLabels(['PDF v2', 'HTML']);

        // The earlier version untouched (Rules 1, 11).
        await galleys.open(submission.submissionId, submission.publicationId);
        await galleys.expectLabels(['Remote', 'PDF (corrected)', 'HTML']);

        // Control: the reader's page as before (Rule 11; Side effects).
        await openArticle(reader, tag, submission.submissionId);
        await expect(readerGalleyLinks(reader)).toHaveText(['Remote', 'PDF (corrected)', `HTML (${FRENCH})`]);
    });

    test('S4: the Layout Editor builds, the Author reads', async ({asUser, ojsApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s4', testInfo);
        const layoutEditor = `${tag}le`;
        const sectionEditor = `${tag}se`;
        const {author} = await seedJournal(ojsApi, tag, {
            extra: [
                user(layoutEditor, 'Leo', 'Layout', ['layoutEditor']),
                user(sectionEditor, 'Sara', 'Section', ['sectionEditor']),
            ],
        });
        const submission = await ojsApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            decisions: ['sendExternalReview', 'accept', 'sendToProduction'],
            participants: [
                {username: layoutEditor, role: 'layoutEditor'},
                {username: sectionEditor, role: 'sectionEditor', canChangeMetadata: false},
            ],
        });

        // The Layout Editor: an empty list, then a galley with a file; the
        // row, "Order" and the full menu (Actors row 2; Rule 2).
        const le = await pageAs(asUser, layoutEditor, tag);
        await le.galleys.open(submission.submissionId, submission.publicationId);
        await expect(le.galleys.noItems()).toHaveText(TEXT.noItems);
        await expect(le.galleys.addButton()).toBeVisible();
        await le.galleys.addGalley({label: 'PDF', component: COMPONENT, file: ARTICLE_PDF, name: 'article.pdf'});
        await le.galleys.expectLabels(['PDF']);
        await expect(le.galleys.languageCell('PDF')).toHaveText(ENGLISH);
        await expect(le.galleys.orderButton()).toBeVisible();
        expect(await le.galleys.menuOffers('PDF')).toEqual(MENU_FULL);

        // The Section Editor without "Permissions" saves an edit (Actors
        // row 2; OPS1).
        const se = await pageAs(asUser, sectionEditor, tag);
        await se.galleys.open(submission.submissionId, submission.publicationId);
        const win = await se.galleys.openEdit('PDF');
        await win.type(win.labelBox(), 'PDF (final)');
        await win.save();
        await se.galleys.expectLabels(['PDF (final)']);

        // The Author: the row, its language and its file; no "Order", no
        // "Add galley", no "…" on the row (Actors rows 2–4).
        const au = await pageAs(asUser, author, tag);
        await au.galleys.openAuthor(submission.submissionId, submission.publicationId);
        await au.galleys.expectLabels(['PDF (final)']);
        await expect(au.galleys.languageCell('PDF (final)')).toHaveText(ENGLISH);
        expect(await au.galleys.downloadedName('PDF (final)')).toBe('article.pdf');
        await expect(au.galleys.orderButton()).toHaveCount(0);
        await expect(au.galleys.addButton()).toHaveCount(0);
        await expect(au.galleys.rowButtons('PDF (final)')).toHaveCount(0);

        // Control: the Layout Editor's page, opened the same way, shows
        // "Order", "Add galley" and the row's "…" (Actors row 2).
        await le.galleys.open(submission.submissionId, submission.publicationId);
        await le.galleys.expectLabels(['PDF (final)']);
        await expect(le.galleys.orderButton()).toHaveCount(1);
        await expect(le.galleys.addButton()).toHaveCount(1);
        await expect(le.galleys.rowButtons('PDF (final)')).toHaveCount(1);
    });
});
