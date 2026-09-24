// @ts-check
/**
 * @file playwright/tests/U46-galleys.spec.js
 *
 * Galleys — OPS suite, one test per canonical scenario the spec runs on a
 * preprint server (S1–S3 common; S6–S8 {OPS}; S4 is the journal's, in the
 * OJS tree, and S5 the press's, in the OMP tree), in the preprint server's
 * own words: the Preprint Server Manager, a preprint, the "Preprint" group
 * whose pages are headed "Preprint: …", the component "Preprint Text", the
 * fixtures "preprint.pdf" and "preprint.html", the Moderator, a posted
 * preprint and its page `preprint/view/{id}`.
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
 * - OPS2 🐞: S7's Moderator without "Permissions" is read on the "Edit"
 *   window only; "Add galley", "Save Order", "Delete" and "Change File"
 *   are never pressed there.
 * - OPS3 🐞: S6's Author uses "Change File" only on the galley they
 *   uploaded; no seeded galley's "Change File" is pressed by an Author.
 * - A4, A6: not on these scenarios' paths (S3 deletes the new version's
 *   copy, never the published galley, and changes no file there). OJS1:
 *   the journal's, in that tree.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only. S1 and S6 run on publicknowledge on their own scratch
 * preprints (`manager.maya`, submitter `author.alex`; the seeded server
 * keeps the Author role's "Permit submission metadata edit." ticked, as
 * installed); S2, S3, S7 and S8 run on scratch preprint servers with
 * throwaway accounts (the username twice as password), as footnote s
 * says: `context.supportedSubmissionLocales` (S2, S3), `roles.author
 * .permitMetadataEdit: false` (S8, whose one section also waives the
 * abstract, which the start form leaves empty), the submission's `galleys[]`
 * (`preprint.pdf`, `preprint.html`, a remote address), `published` (a
 * posted preprint) and `participants[]` with `canChangeMetadata` (S7's
 * Moderator). No key sets a URL Path or makes a second version: S3 types
 * the path and uses "Create New Version" (PublicationPages'
 * `createNewVersion`, pressed once the version has loaded). S8's galley is
 * added in the submission wizard of a submission the Author starts on
 * screen and submits in one pass (a draft already listing a galley is
 * never reopened: U21's script failure).
 *
 * Every absence is read settled and paired with a positive control taken
 * the same way (M4, M6); S2's mailbox silence is bounded by a discussion
 * the manager opens with a spare account of its own server (A8). Browser
 * dialogs are recorded and answered on every page (the window's "The data
 * on this form has changed…" question). Waits are web-first or bounded by
 * the screen's own answer (A5). Everything runs in the parallel `ops`
 * project.
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
const {PublicationScreen, openWorkflow, addDiscussion, createNewVersion} = require('../pages/PublicationPages.js');
const {startUrl, beginSubmission, completeAndSubmitDraft} = require('../pages/SubmissionWizardPages.js');

const SERVER = 'publicknowledge';
const MANAGER = 'manager.maya';
const AUTHOR = 'author.alex';
const COMPONENT = 'Preprint Text';
const ENGLISH = 'English';
const FRENCH = 'French (Canada)';
const REMOTE_URL = 'https://example.org/paper';
const FILES = path.join(__dirname, '..', 'fixtures', 'files');
const PREPRINT_PDF = path.join(FILES, 'preprint.pdf');
const REPLACEMENT_PDF = path.join(FILES, 'replacement.pdf');
const MENU_FULL = ['Edit', 'Change File', 'More Information', 'Delete'];

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u46${scenario}opw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: mailOf(username), roles};
}

/**
 * Seed a scratch preprint server with a throwaway Preprint Server Manager
 * and Author, and `extra` accounts; returns the usernames.
 */
async function seedServer(opsApi, tag, {extra = [], ...keys} = {}) {
    const users = [user(`${tag}mg`, 'Mona', 'Manager', ['manager']), user(`${tag}au`, 'Ada', 'Author', ['author']), ...extra];
    await opsApi.createContext({tag, users, ...keys});
    return {manager: `${tag}mg`, author: `${tag}au`};
}

/**
 * A page as `username`: the workflow frame of `contextPath` (the "Preprint"
 * group), the Galleys page object and a recorder of every browser dialog
 * (answered "OK" unless the test queues "Cancel").
 */
async function pageAs(asUser, appContext, username, contextPath) {
    const page = await (await asUser(username)).newPage();
    const frame = new WorkflowPage(page, contextPath, {appContext, labels: {publicationGroup: 'Preprint'}});
    return {page, frame, galleys: new GalleyManager(page, frame), dialogs: recordBrowserDialogs(page)};
}

/** A signed-out reader page (an explicit empty state, patterns.md lesson 8). */
async function readerPage(browser, baseURL) {
    const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
    return context.newPage();
}

/** The posted preprint's page on the server's public site, its galley links loaded. */
async function openPreprint(page, contextPath, submissionId) {
    await page.goto(`/index.php/${contextPath}/preprint/view/${submissionId}`);
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
    test('S1: build a galley and its file', {tag: '@smoke'}, async ({asUser, opsApi, appContext}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s1', testInfo);
        const submission = await opsApi.createSubmission({
            tag,
            context: SERVER,
            submitter: AUTHOR,
            title: `Galleys ${tag}`,
        });
        const {page, frame, galleys, dialogs} = await pageAs(asUser, appContext, MANAGER, SERVER);

        // An empty page: the heading, "No Items", "Add galley" and no
        // "Order" (Fields; Rule 12).
        await galleys.open(submission.submissionId, submission.publicationId);
        await expect(frame.heading()).toHaveText('Preprint: Galleys');
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
        // label downloading "preprint.pdf" (Rule 2; Fields, Name).
        await win.type(win.labelBox(), 'PDF');
        await win.save();
        const wizard = galleyUploadWizard(page);
        await wizard.expectOpen();
        await expect(wizard.componentSelect()).toBeVisible();
        await galleys.uploadInWizard({component: COMPONENT, file: PREPRINT_PDF, name: 'preprint.pdf'});
        await galleys.expectLabels(['PDF']);
        await expect(galleys.languageCell('PDF')).toHaveText(ENGLISH);
        expect(await galleys.downloadedName('PDF')).toBe('preprint.pdf');

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

    test('S2: edit, order and delete galleys', async ({asUser, opsApi, pkpMail, appContext}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s2', testInfo);
        const spare = `${tag}x`;
        const {manager, author} = await seedServer(opsApi, tag, {
            context: {supportedSubmissionLocales: ['en', 'fr_CA']},
            extra: [user(spare, 'Xena', 'Spare', ['author'])],
        });
        const [submission, control] = await Promise.all([
            opsApi.createSubmission({
                tag,
                context: tag,
                submitter: author,
                galleys: [
                    {label: 'PDF', locale: 'en', file: 'preprint.pdf'},
                    {label: 'HTML', locale: 'en', file: 'preprint.html'},
                ],
            }),
            opsApi.createSubmission({tag: `${tag}c`, context: tag, submitter: spare}),
        ]);
        const {page, frame, galleys, dialogs} = await pageAs(asUser, appContext, manager, tag);

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
        expect(events).toContain(`A file "preprint.html" was deleted for submission ${submission.submissionId} by ${manager}.`);
        await log.close();

        // No email about any of it: bounded by the one mail the test sends
        // itself the same way, a discussion with the spare on the spare's
        // own preprint (Side effects; A8). The manager opened it and is on
        // it: its copy of the control is its only mail.
        const discussion = `Control ${tag}`;
        await openWorkflow(page, tag, control.submissionId);
        await new PublicationScreen(page).openProductionStage();
        await addDiscussion(page, {name: discussion, message: `Control message ${tag}.`, participants: [spare]});
        const afterControl = {to: mailOf(spare), subject: discussion};
        await pkpMail.expectNone({to: mailOf(author), afterControl});
        await expect.poll(() => pkpMail.count({to: mailOf(manager), subject: discussion}), {timeout: 20_000}).toBe(1);
        expect(await pkpMail.count({to: mailOf(manager), contains: tag})).toBe(1);

        // Control: "PDF2" still downloads "preprint.pdf" (Rule 9).
        await galleys.open(submission.submissionId, submission.publicationId);
        expect(await galleys.downloadedName('PDF2')).toBe('preprint.pdf');
    });

    test('S3: a posted version\'s galleys, its readers and a new version', async ({asUser, opsApi, browser, baseURL, appContext}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s3', testInfo);
        const {manager, author} = await seedServer(opsApi, tag, {
            context: {supportedSubmissionLocales: ['en', 'fr_CA']},
        });
        const submission = await opsApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            galleys: [
                {label: 'PDF', locale: 'en', file: 'preprint.pdf'},
                {label: 'HTML', locale: 'fr_CA', file: 'preprint.html'},
                {label: 'Remote', locale: 'en', urlRemote: REMOTE_URL},
            ],
            published: true,
        });
        const {page, frame, galleys} = await pageAs(asUser, appContext, manager, tag);
        const reader = await readerPage(browser, baseURL);

        // The posted version's page: "Order", "Add galley" and the full
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

        // A URL Path and an order on the posted version (Rules 8b, 10).
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
        await openPreprint(reader, tag, submission.submissionId);
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
        await openPreprint(reader, tag, submission.submissionId);
        await expect(readerGalleyLinks(reader)).toHaveText(['Remote', 'PDF (corrected)', `HTML (${FRENCH})`]);

        // The new version's copies: same labels, languages, order, remote
        // address and URL Path (Rule 11).
        await frame.expectVersionLoaded();
        const created = await createNewVersion(page);
        await galleys.open(submission.submissionId, created.id);
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
        // posted galley also has; "Remote" deleted (Rules 5, 11).
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
        await openPreprint(reader, tag, submission.submissionId);
        await expect(readerGalleyLinks(reader)).toHaveText(['Remote', 'PDF (corrected)', `HTML (${FRENCH})`]);
    });

    test('S6: the preprint\'s Author before and after posting', async ({asUser, opsApi, appContext}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s6', testInfo);
        const [unposted, posted] = await Promise.all([
            opsApi.createSubmission({tag, context: SERVER, submitter: AUTHOR, title: `Unposted ${tag}`}),
            opsApi.createSubmission({
                tag: `${tag}p`,
                context: SERVER,
                submitter: AUTHOR,
                title: `Posted ${tag}`,
                galleys: [{label: 'PDF', locale: 'en', file: 'preprint.pdf'}],
                published: true,
            }),
        ]);

        // The Author, before posting: "No Items" and "Add galley"; a galley
        // with the Author's own file; "Order" shows (Actors row 2; Rule 2).
        const au = await pageAs(asUser, appContext, AUTHOR, SERVER);
        await au.galleys.openAuthor(unposted.submissionId, unposted.publicationId);
        await expect(au.galleys.noItems()).toHaveText(TEXT.noItems);
        await expect(au.galleys.addButton()).toBeVisible();
        await expect(au.galleys.orderButton()).toHaveCount(0);
        await au.galleys.addGalley({label: 'PDF', component: COMPONENT, file: PREPRINT_PDF, name: 'preprint.pdf'});
        await au.galleys.expectLabels(['PDF']);
        expect(await au.galleys.downloadedName('PDF')).toBe('preprint.pdf');
        await expect(au.galleys.orderButton()).toBeVisible();

        // The Author's row menu: no "More Information" (Actors rows 2 and 4).
        expect(await au.galleys.menuOffers('PDF')).toEqual(['Edit', 'Change File', 'Delete']);

        // "Change File" on the Author's own galley (Actors row 2; Rule 3).
        await au.galleys.openChangeFile('PDF');
        await au.galleys.uploadInWizard({file: REPLACEMENT_PDF, name: 'replacement.pdf'});
        await expect(au.galleys.row('PDF')).toBeVisible();
        expect(await au.galleys.downloadedName('PDF')).toBe('replacement.pdf');

        // "Edit" (Actors row 2; Rule 6).
        const win = await au.galleys.openEdit('PDF');
        await win.type(win.labelBox(), 'PDF (author)');
        await win.save();
        await au.galleys.expectLabels(['PDF (author)']);

        // The Author, after posting: the row listed, no "Order", no "Add
        // galley", only "View", which opens "View Galley" read-only
        // (Actors row 3; Rule 7).
        await au.galleys.openAuthor(posted.submissionId, posted.publicationId);
        await au.galleys.expectLabels(['PDF']);
        await expect(au.galleys.orderButton()).toHaveCount(0);
        await expect(au.galleys.addButton()).toHaveCount(0);
        expect(await au.galleys.menuOffers('PDF')).toEqual(['View']);
        const view = await au.galleys.openView('PDF');
        await expect(view.labelBox()).toHaveValue('PDF');
        await view.expectReadOnly();
        await view.close();

        // Control: the Preprint Server Manager on the posted preprint sees
        // "Order", "Add galley" and the full menu (Actors row 2; Rule 10).
        const mg = await pageAs(asUser, appContext, MANAGER, SERVER);
        await mg.galleys.open(posted.submissionId, posted.publicationId);
        await mg.galleys.expectLabels(['PDF']);
        await expect(mg.galleys.orderButton()).toBeVisible();
        await expect(mg.galleys.addButton()).toBeVisible();
        expect(await mg.galleys.menuOffers('PDF')).toEqual(MENU_FULL);
    });

    test('S7: a Moderator\'s galleys and the "Permissions" box', async ({asUser, opsApi, appContext}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s7', testInfo);
        const moderator = `${tag}md`;
        const {author} = await seedServer(opsApi, tag, {
            extra: [user(moderator, 'Mia', 'Moderator', ['sectionEditor'])],
        });
        const galleys = [{label: 'PDF', locale: 'en', file: 'preprint.pdf'}];
        const [ticked, unticked, posted] = await Promise.all([
            opsApi.createSubmission({
                tag,
                context: tag,
                submitter: author,
                galleys,
                participants: [{username: moderator, role: 'sectionEditor', canChangeMetadata: true}],
            }),
            opsApi.createSubmission({
                tag: `${tag}u`,
                context: tag,
                submitter: author,
                galleys,
                participants: [{username: moderator, role: 'sectionEditor', canChangeMetadata: false}],
            }),
            opsApi.createSubmission({
                tag: `${tag}p`,
                context: tag,
                submitter: author,
                galleys,
                participants: [{username: moderator, role: 'sectionEditor', canChangeMetadata: false}],
                published: true,
            }),
        ]);
        const md = await pageAs(asUser, appContext, moderator, tag);

        // "Permissions" ticked, before posting: "Edit" saves (Actors row 2).
        await md.galleys.open(ticked.submissionId, ticked.publicationId);
        let win = await md.galleys.openEdit('PDF');
        await win.type(win.labelBox(), 'PDF2');
        await win.save();
        await md.galleys.expectLabels(['PDF2']);

        // "Permissions" unticked, before posting: "Edit" opens read-only
        // (Actors row 2; Rule 7; OPS2).
        await md.galleys.open(unticked.submissionId, unticked.publicationId);
        win = await md.galleys.openEdit('PDF');
        await expect(win.labelBox()).toHaveValue('PDF');
        await win.expectReadOnly();
        await win.close();

        // "Permissions" unticked, after posting: "Edit" saves (Actors row 2;
        // Rule 10).
        await md.galleys.open(posted.submissionId, posted.publicationId);
        win = await md.galleys.openEdit('PDF');
        await win.type(win.labelBox(), 'PDF posted');
        await win.save();
        await md.galleys.expectLabels(['PDF posted']);

        // Control: the first preprint's "Edit", opened the same way, lets
        // its fields be changed and has "Save" and "Cancel" (Actors row 2).
        await md.galleys.open(ticked.submissionId, ticked.publicationId);
        win = await md.galleys.openEdit('PDF2');
        await win.expectEditable();
        const count = await win.fields().count();
        for (let i = 0; i < count; i++) {
            await expect(win.fields().nth(i)).toBeEnabled();
        }
        await win.cancel();
    });

    test('S8: the Author role without "Permit submission metadata edit."', async ({asUser, opsApi, appContext}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s8', testInfo);
        const {manager, author} = await seedServer(opsApi, tag, {
            roles: {author: {permitMetadataEdit: false}},
            // The start form leaves the abstract empty, and the default
            // section requires one; its waiver keeps the wizard on the galley.
            sections: [{abbrev: 'PRE', title: {en: 'Preprints'}, abstractsNotRequired: true}],
        });

        // A galley added in the submission wizard: a new submission, "Add
        // File" with the label "PDF" and "preprint.pdf", submitted
        // (Settings bullet 4; U21 scenario 15).
        const au = await pageAs(asUser, appContext, author, tag);
        await au.page.goto(startUrl(tag));
        await beginSubmission(au.page, {title: `Wizard galley ${tag}`});
        const submissionId = Number(new URL(au.page.url()).searchParams.get('id'));
        expect(submissionId).toBeGreaterThan(0);
        await completeAndSubmitDraft(au.page, {label: 'PDF'});

        // The "Galleys" page after submitting: the row listed, no "Order",
        // no "Add galley", only "View" (Actors row 3; Rule 7; Settings
        // bullet 4).
        await au.frame.gotoAuthor(submissionId);
        await au.frame.selectPage('Galleys');
        await au.galleys.expectLoaded();
        await au.galleys.expectLabels(['PDF']);
        await expect(au.galleys.orderButton()).toHaveCount(0);
        await expect(au.galleys.addButton()).toHaveCount(0);
        expect(await au.galleys.menuOffers('PDF')).toEqual(['View']);

        // Control: the Preprint Server Manager opens the same page the same
        // way: "Order", "Add galley" and the full menu (Actors row 2).
        const mg = await pageAs(asUser, appContext, manager, tag);
        await mg.frame.gotoEditorial(submissionId);
        await mg.frame.selectPage('Galleys');
        await mg.galleys.expectLoaded();
        await mg.galleys.expectLabels(['PDF']);
        await expect(mg.galleys.orderButton()).toBeVisible();
        await expect(mg.galleys.addButton()).toBeVisible();
        expect(await mg.galleys.menuOffers('PDF')).toEqual(MENU_FULL);
    });
});
