// @ts-check
/**
 * @file playwright/tests/U44-identifiers.spec.js
 *
 * Identifiers (publisher IDs & URN) — OJS suite, one test per canonical
 * scenario the spec runs on OJS (S1 common; S2–S4 {OJS OMP}; S5, S6
 * {OJS}; S7 is the preprint server's, in the OPS tree).
 * Spec: docs/specs/U44-identifiers.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A7 🐞: a tab's assign box is read as ticked, and its label only as
 *   "Assign the URN" … "to this galley" / "to this issue", never whole.
 * - A9 🐞: S3's Layout Editor is read for the greyed "Save" only; the
 *   "Assign" that page offers is not asserted.
 * - A6 🐞: S4's "Add Check Number" is read as one digit added, never its
 *   value.
 * - A10 🐞: S2 reads the prefix refusal at the top of the window only.
 * - A14 🐞: after a galley tab's "Clear" › "OK" the tab is read only once
 *   the window is closed and opened again.
 * - A4 🐞: no "Save" on the "Identifiers" page runs with the stored URN
 *   still in the box.
 * - A2, A3, A5, A8, A11, A12, A13, OJS1, OJS2, OJS3: not on these
 *   scenarios' paths (S6 reads the issue's "Publisher ID" box, never a
 *   value saved in it). OMP1–OMP6: the press's, in that tree.
 *
 * Seeding: scenario endpoints only; publicknowledge is never touched. Every
 * scenario runs on its own scratch journal with throwaway accounts (the
 * username twice as password), as footnote s says: `context.acronym` JPK,
 * `enablePublisherId` for the "Publisher ID" boxes, `plugins.urnpubidplugin`
 * with every key the settings window writes (`urnCheckNo` always),
 * `issues[]`, the submission's `galleys[]` and `participants[]`. No key
 * stores a URN or assigns an unpublished article to an issue, so S3, S5 and
 * S6 assign the issue on "Publication Settings" (U49's screen). S1 and S2
 * change the settings on screen because those screens are what they test.
 *
 * Every absence is read settled and paired with a positive control taken
 * the same way (M4, M6); S1's mailbox silence is bounded by a "Notify" the
 * test sends to a spare account of its own journal (A8). Browser dialogs
 * are accepted and recorded on every page that switches tabs, closes a
 * window, navigates or reloads. Waits are web-first or bounded by the
 * screen's own answer (A5). Everything runs in the parallel `ojs` project:
 * the URN plugin and the settings are per scratch journal.
 */
const {test, expect} = require('../support/fixtures.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {ActivityLogWindow} = require('../../../../shared/playwright/pages/ActivityLogPages.js');
const {
    IDENTIFIERS_TEXT: TEXT,
    PublisherIdSettings,
    UrnPluginSettings,
    IdentifiersPage,
    GalleysPage,
    IssuesPage,
    answerQuestion,
    readerUrnLinks,
    articleUrnHeading,
    publishUrnTable,
    publishUrnRow,
    CLEAR_REQUEST,
    CLEAR_ISSUE_OBJECTS_REQUEST,
    REASSIGN_REQUEST,
} = require('../../../../shared/playwright/pages/IdentifiersPages.js');
const {PublicationScreen} = require('../pages/PublicationMetadataPages.js');
const {PublishScreen} = require('../pages/PublishSchedulePages.js');

const PREFIX = 'urn:nbn:de:0000-';
const RESOLVER = 'https://nbn-resolving.de/';
const METADATA_EVENT = 'Submission metadata updated';
const NOTIFY_SUBJECT = 'Discussion (Submission)';
const ISSUE_2 = 'Vol. 1 No. 2 (2026)';
const ISSUE_3 = 'Vol. 1 No. 3 (2026)';
const ISSUE_2_OPTION = /Vol\. 1 No\. 2 \(2026\)/;
const JOURNAL_BOXES = ['Enable for Publications', 'Enable for Galleys', 'Enable for Issues', 'Enable for Issue Galleys'];
const URN_WINDOW_INTRO = 'Please configure the URN plugin to be able to manage and use URNs in OJS:';
const URN_KINDS = ['Issues', 'Articles', 'Galleys'];
const DEFAULT_PATTERNS = ['%j.v%vi%i for issues', '%j.v%vi%i.%a for articles', '%j.v%vi%i.%a.g%g for galleys'];
const NAMESPACES = ['', 'urn:nbn:de', 'urn:nbn:at', 'urn:nbn:ch', 'urn:nbn:fi', 'urn:nbn', 'urn'];

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u44${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: mailOf(username), roles};
}

/**
 * The URN plugin's `plugins` entry with every key its settings window
 * writes (scenarios.md: without `urnCheckNo` the "Identifiers" page arrives
 * empty).
 */
function urnPlugin({issue = false, publication = false, galley = false, suffix = 'default', checkNo = false}) {
    return {
        urnpubidplugin: {
            enabled: true,
            settings: {
                enableIssueURN: issue,
                enablePublicationURN: publication,
                enableRepresentationURN: galley,
                urnPrefix: PREFIX,
                urnSuffix: suffix,
                urnCheckNo: checkNo,
                urnNamespace: 'urn:nbn:de',
                urnResolver: RESOLVER,
            },
        },
    };
}

/**
 * Seed a scratch journal (initials "JPK") with a throwaway Journal Manager
 * and Author, and `extra` accounts; returns the usernames and the response.
 */
async function seedJournal(ojsApi, tag, {extra = [], ...keys} = {}) {
    const users = [user(`${tag}mg`, 'Mona', 'Manager', ['manager']), user(`${tag}au`, 'Ada', 'Author', ['author']), ...extra];
    const response = await ojsApi.createContext({tag, context: {acronym: 'JPK'}, users, ...keys});
    return {manager: `${tag}mg`, author: `${tag}au`, response};
}

/** A page as `username` with the workflow frame of `contextPath`, every browser dialog accepted and recorded. */
async function pageAs(asUser, username, contextPath) {
    const page = await (await asUser(username)).newPage();
    /** @type {string[]} */
    const asked = [];
    page.on('dialog', (dialog) => {
        asked.push(`${dialog.type()}: ${dialog.message()}`);
        dialog.accept().catch(() => {});
    });
    return {page, frame: new WorkflowPage(page, contextPath), asked};
}

/** A signed-out reader page (an explicit empty state, patterns.md lesson 8). */
async function readerPage(browser, baseURL) {
    const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
    return context.newPage();
}

/** Open the Metadata page by address; settled on its "Keywords" field, the page's own control. */
async function openMetadata(frame, submission) {
    await frame.gotoEditorial(submission.submissionId, {menuKey: `publication_${submission.publicationId}_metadata`});
    await frame.expectPageHeading('Metadata');
    await expect(frame.dialog().getByText('Keywords', {exact: true}).first()).toBeVisible({timeout: 30_000});
}

/** The Activity Log's line count and its "Submission metadata updated" count, then the window closed. */
async function activityLogCounts(page, frame) {
    const log = new ActivityLogWindow(page, frame);
    await log.open();
    const lines = await log.historyLines();
    await log.close();
    return {total: lines.length, metadata: lines.filter((l) => l.event === METADATA_EVENT).length};
}

/**
 * "Publication Settings": "Assign To Current/Back Issue", the issue, "Save"
 * (U49's screen, through its page object), then back on the version.
 */
async function assignToIssue(page, frame, contextPath, submission) {
    const pub = new PublicationScreen(page, contextPath);
    await frame.gotoEditorial(submission.submissionId, {menuKey: `publication_${submission.publicationId}_issue`});
    await frame.expectPageHeading('Publication Settings');
    const back = page.getByRole('radio', {name: 'Assign To Current/Back Issue'});
    await expect(back).toBeVisible({timeout: 30_000});
    await pub.awaitAssignmentPreselected(page);
    await back.check();
    await pub.selectIssueOption(page, ISSUE_2_OPTION);
    await pub.save();
}

/**
 * "Schedule For Publication": the first time the "Review Publishing
 * Details" panel opens, filled with "Version of Record" and "Major
 * Revision" and confirmed; once those are saved the button opens the
 * confirmation window straight away. Returns the confirmation window. The
 * first press is occasionally swallowed (U49 fn-k), so it is repeated once
 * when neither has appeared.
 */
async function openConfirmation(page, contextPath) {
    const publish = new PublishScreen(page, contextPath);
    const window = publish.confirmationDialog('Are you sure you want to publish this?');
    const panel = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'}).last();
    const stage = panel.locator('select[name="versionStage"]');
    const button = publish.publishButton();
    await expect(button).toBeVisible({timeout: 30_000});
    await button.click();
    try {
        await expect(stage.or(window)).toBeVisible({timeout: 5_000});
    } catch {
        await button.click();
    }
    await expect(stage.or(window)).toBeVisible({timeout: 30_000});
    if (await stage.isVisible()) {
        await publish.fillVersionDetails(panel);
        // The version is in an issue already: "Assign To Current/Back
        // Issue" arrives preselected with it.
        await publish.awaitAssignmentPreselected(panel);
        await expect(panel.getByRole('radio', {name: 'Assign To Current/Back Issue'})).toBeChecked();
        await expect(panel.locator('select[name="issueId"] option:checked')).toHaveText(ISSUE_2_OPTION);
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
    }
    await expect(window).toBeVisible({timeout: 30_000});
    return {publish, window};
}

test.describe('identifiers', () => {
    test('S1: switch publisher IDs on and type them', {tag: '@smoke'}, async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s1', testInfo);
        const spare = `${tag}x`;
        const {manager, author} = await seedJournal(ojsApi, tag, {
            extra: [user(spare, 'Xena', 'Spare', ['author'])],
        });
        const [submission, control] = await Promise.all([
            ojsApi.createSubmission({
                tag,
                context: tag,
                submitter: author,
                galleys: [
                    {label: 'PDF', file: 'article.pdf'},
                    {label: 'HTML', file: 'article.pdf'},
                ],
            }),
            ojsApi.createSubmission({tag: `${tag}c`, context: tag, submitter: spare}),
        ]);
        const {page, frame} = await pageAs(asUser, manager, tag);
        const ids = new IdentifiersPage(page, frame);
        const galleys = new GalleysPage(page, frame);
        const settings = new PublisherIdSettings(page, tag);

        // Control: before the first "Save" on Settings the Metadata page
        // shows no "Publisher ID" (Rules 1, 2).
        await openMetadata(frame, submission);
        await expect(ids.metadataPublisherIdBox()).toHaveCount(0);

        // The "Publisher ID" boxes: the help text and four boxes, all
        // unticked; tick Publications and Galleys, "Save" (Fields;
        // Settings bullet 1).
        await settings.open();
        await expect(settings.group()).toContainText(TEXT.publisherIdHelp);
        expect(await settings.boxes()).toEqual(JOURNAL_BOXES.map((label) => ({label, checked: false})));
        await settings.setBoxes({'Enable for Publications': true, 'Enable for Galleys': true});
        await settings.save();

        // The Metadata page: a "Publisher ID" box; "pid-a1" saved and back
        // after a reload (Rules 2, 3). The Activity Log's baseline first.
        await openMetadata(frame, submission);
        const logBefore = await activityLogCounts(page, frame);
        await expect(ids.metadataPublisherIdBox()).toBeVisible();
        await ids.metadataPublisherIdBox().fill('pid-a1');
        await ids.save();
        await openMetadata(frame, submission);
        await expect(ids.metadataPublisherIdBox()).toHaveValue('pid-a1');

        // A galley's publisher ID: digits alone and "/" refused at the top of
        // the tab with the window open; "pid-g1" closes the window and is
        // back when the tab is opened again (Rule 4).
        await galleys.open(submission.submissionId, submission.publicationId);
        let tab = await galleys.openIdentifiers('PDF');
        await expect(tab.publisherIdBox()).toBeVisible();
        await tab.publisherIdBox().fill('12345');
        await tab.saveRefused();
        await expect(tab.form()).toContainText(TEXT.notANumber('12345'));
        await tab.publisherIdBox().fill('a/b');
        await tab.saveRefused();
        await expect(tab.form()).toContainText(TEXT.slash);
        await tab.publisherIdBox().fill('pid-g1');
        await tab.save();
        tab = await galleys.openIdentifiers('PDF');
        await expect(tab.publisherIdBox()).toHaveValue('pid-g1');
        await tab.close();

        // A publisher ID another galley has: refused on "HTML" (Rule 4).
        tab = await galleys.openIdentifiers('HTML');
        await tab.publisherIdBox().fill('pid-g1');
        await tab.saveRefused();
        await expect(tab.form()).toContainText(TEXT.duplicate('pid-g1', 'journal'));
        await tab.close();

        // The Activity Log: one "Submission metadata updated" line more,
        // from the Metadata page, and nothing from the galley saves (Side
        // effects).
        const logAfter = await activityLogCounts(page, frame);
        expect(logAfter.metadata).toBe(logBefore.metadata + 1);
        expect(logAfter.total).toBe(logBefore.total + 1);

        // No email about these saves: bounded by the one mail the test sends
        // itself the same way, a "Notify" to the spare (Side effects; A8).
        const notify = new PublicationScreen(page, tag);
        await notify.gotoWorkflow(control.submissionId);
        await notify.openStage('Submission');
        await notify.notifyParticipant('Xena Spare', `<p>Control ${tag}</p>`);
        const afterControl = {to: mailOf(spare), subject: NOTIFY_SUBJECT, contains: `Control ${tag}`};
        await pkpMail.expectNone({to: mailOf(author), afterControl});
        await pkpMail.expectNone({to: mailOf(manager), afterControl});

        // Switched off: no "Publisher ID" on the Metadata page, no
        // "Identifiers" tab on the "PDF" galley's window (its "Edit
        // Metadata" tab the control) (Rule 2; Settings bullet 1).
        await settings.open();
        await settings.setBoxes({'Enable for Publications': false, 'Enable for Galleys': false});
        await settings.save();
        await openMetadata(frame, submission);
        await expect(ids.metadataPublisherIdBox()).toHaveCount(0);
        await galleys.open(submission.submissionId, submission.publicationId);
        tab = await galleys.openEdit('PDF');
        await expect(tab.tab('Edit Metadata')).toBeVisible();
        await expect(tab.tab('Identifiers')).toHaveCount(0);
        await tab.close();

        // On again: both values are back (Rule 2).
        await settings.open();
        await settings.setBoxes({'Enable for Publications': true, 'Enable for Galleys': true});
        await settings.save();
        await openMetadata(frame, submission);
        await expect(ids.metadataPublisherIdBox()).toHaveValue('pid-a1');
        await galleys.open(submission.submissionId, submission.publicationId);
        tab = await galleys.openIdentifiers('PDF');
        await expect(tab.publisherIdBox()).toHaveValue('pid-g1');
        await tab.close();
    });

    test('S2: configure the URN plugin', async ({asUser, ojsApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s2', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const submission = await ojsApi.createSubmission({tag, context: tag, submitter: author});
        const {page} = await pageAs(asUser, manager, tag);
        const plugins = new UrnPluginSettings(page, tag);

        // The plugin: under "Public Identifier Plugins", unticked; tick it
        // (Settings bullet 2).
        await plugins.openPlugins();
        await expect(plugins.rowCategory()).toContainText('Public Identifier Plugins');
        await expect(plugins.row()).toContainText('URN');
        await expect(plugins.enabledBox()).not.toBeChecked();
        await plugins.setEnabled(true);

        // Control: with the plugin enabled and nothing saved yet, the
        // Publication area lists no "Identifiers" ("Metadata" listed, read
        // the same way) (Rule 7).
        const workflow = await pageAs(asUser, manager, tag);
        await workflow.frame.gotoEditorial(submission.submissionId);
        await workflow.frame.expandLatestVersionNode();
        await expect(workflow.frame.pageLink('Metadata')).toBeVisible();
        await expect(workflow.frame.pageLink('Identifiers')).toHaveCount(0);

        // The window as it opens (Fields; Settings bullets 3–5).
        await plugins.openSettings();
        await expect(page.getByRole('dialog', {name: 'URN', exact: true})).toBeVisible();
        await expect(plugins.window()).toContainText(URN_WINDOW_INTRO);
        for (const kind of URN_KINDS) {
            await expect(plugins.kindBox(kind)).not.toBeChecked();
        }
        await expect(plugins.suffixRadio('default')).toBeChecked();
        for (const pattern of DEFAULT_PATTERNS) {
            await expect(plugins.form()).toContainText(pattern);
        }
        await expect(plugins.checkNumberBox()).not.toBeChecked();
        expect(await plugins.namespaceOptions()).toEqual(NAMESPACES);
        await expect(plugins.reassignButton()).toBeVisible();

        // Required boxes left empty: refused in the browser under "URN
        // Prefix", "Namespace" and "Resolver URL", nothing sent (Fields).
        await plugins.setKind('Articles', true);
        const sentEmpty = await plugins.saveRefusedInBrowser(plugins.fieldError('urnPrefix'));
        expect(sentEmpty).toBe(0);
        await expect(plugins.fieldError('urnPrefix')).toHaveText(TEXT.required);
        await expect(plugins.fieldError('urnNamespace')).toHaveText(TEXT.required);
        await expect(plugins.fieldError('urnResolver')).toHaveText(TEXT.required);

        // A resolver address that is not a full web address (Fields).
        await plugins.prefixBox().fill(PREFIX);
        await plugins.namespaceSelect().selectOption('urn:nbn:de');
        await plugins.resolverBox().fill('https://nbn-resolving');
        const sentUrl = await plugins.saveRefusedInBrowser(
            plugins.fieldError('urnResolver').filter({hasText: TEXT.invalidUrl})
        );
        expect(sentUrl).toBe(0);

        // A prefix not shaped "urn:…:": the server's refusal at the top of
        // the window, which stays open (Fields; the top line only, A10).
        await plugins.resolverBox().fill(RESOLVER);
        await plugins.prefixBox().fill('nbn:de:0000-');
        await plugins.saveRefusedByServer();
        await expect(plugins.formErrorItems()).toHaveText([TEXT.prefixPattern]);

        // No kind ticked (Fields).
        await plugins.prefixBox().fill(PREFIX);
        await plugins.namespaceSelect().selectOption('urn:nbn:de');
        await plugins.resolverBox().fill(RESOLVER);
        await plugins.setKind('Articles', false);
        await plugins.saveRefusedByServer();
        await expect(plugins.formErrors()).toContainText('Errors occurred processing this form:');
        await expect(plugins.formErrorItems()).toHaveText([TEXT.noKind]);

        // Saved: the window closes with the notice (Fields).
        await plugins.setKind('Articles', true);
        await plugins.saveAccepted();

        // The other side: the version now lists "Identifiers" (Rule 7).
        await workflow.frame.gotoEditorial(submission.submissionId);
        await workflow.frame.expandLatestVersionNode();
        await expect(workflow.frame.pageLink('Identifiers')).toBeVisible();
    });

    test('S3: assign an article\'s URN and publish it', async ({asUser, ojsApi, browser, baseURL}, testInfo) => {
        test.setTimeout(360_000);
        const tag = makeTag('s3', testInfo);
        const layoutEditor = `${tag}le`;
        const {manager, author} = await seedJournal(ojsApi, tag, {
            extra: [user(layoutEditor, 'Leo', 'Layout', ['layoutEditor'])],
            issues: [{volume: 1, number: 2, year: 2026, published: true}],
            plugins: urnPlugin({publication: true}),
        });
        const submission = await ojsApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            // In Production: at the Submission stage the Layout Editor's
            // Publication area is empty (T-ojs-1).
            files: [{file: 'article.pdf'}],
            decisions: ['skipExternalReview', 'sendToProduction'],
            participants: [{username: layoutEditor, role: 'layoutEditor'}],
        });
        const sid = submission.submissionId;
        const urn = `${PREFIX}jpk.v1i2.${sid}`;
        const {page, frame, asked} = await pageAs(asUser, manager, tag);
        const ids = new IdentifiersPage(page, frame);

        // No issue yet: a greyed box, no "Assign", the message (Rule 9).
        await ids.open(sid, submission.publicationId);
        await expect(ids.field()).toContainText(TEXT.noIssue);
        await expect(ids.box()).toBeDisabled();
        await expect(ids.assignButton()).toHaveCount(0);

        // Assigned to an issue on "Publication Settings": "Assign" offered (Rule 9).
        await assignToIssue(page, frame, tag, submission);
        await ids.select();
        await expect(ids.assignButton()).toBeVisible();

        // Assign, then leave: the box fills and "Clear" replaces "Assign";
        // away to "Metadata" and back, nothing asked, the box empty again
        // (Rules 8, 9).
        await ids.assignButton().click();
        await expect(ids.box()).toHaveValue(urn);
        await expect(ids.clearButton()).toBeVisible();
        await expect(ids.assignButton()).toHaveCount(0);
        const askedBefore = asked.length;
        await frame.selectPage('Metadata');
        await ids.select();
        await expect(ids.box()).toHaveValue('');
        await expect(ids.assignButton()).toBeVisible();
        expect(asked.length).toBe(askedBefore);

        // Assign and save: stored across a reload, with "Clear"; one
        // "Submission metadata updated" line more (Rule 9; Side effects).
        const logBefore = await activityLogCounts(page, frame);
        await ids.assignButton().click();
        await ids.save();
        await ids.open(sid, submission.publicationId);
        await expect(ids.box()).toHaveValue(urn);
        await expect(ids.clearButton()).toBeVisible();
        const logAfter = await activityLogCounts(page, frame);
        expect(logAfter.metadata).toBe(logBefore.metadata + 1);

        // "Clear" alone saves nothing: nothing asked, the URN back after a
        // reload (Rule 9).
        await ids.clearButton().click();
        await expect(ids.box()).toHaveValue('');
        await ids.open(sid, submission.publicationId);
        await expect(ids.box()).toHaveValue(urn);
        expect(asked.length).toBe(askedBefore);

        // "Clear" and "Save": empty, "Assign" back (Rules 9, 11).
        await ids.clearButton().click();
        await ids.save();
        await ids.open(sid, submission.publicationId);
        await expect(ids.box()).toHaveValue('');
        await expect(ids.assignButton()).toBeVisible();

        // The Layout Editor: the page, with "Save" greyed (Actors row 4; A9
        // not asserted).
        const assistant = await pageAs(asUser, layoutEditor, tag);
        const assistantIds = new IdentifiersPage(assistant.page, assistant.frame);
        await assistantIds.open(sid, submission.publicationId);
        await expect(assistantIds.saveButton()).toBeDisabled();

        // No URN in the confirmation window: the warning; closed without
        // confirming (Rule 17).
        let confirmation = await openConfirmation(page, tag);
        await expect(confirmation.window).toContainText(TEXT.urnNotAssigned);
        await confirmation.publish.closeWindow(confirmation.window);

        // The URN in the confirmation window, then published (Rule 17).
        await ids.open(sid, submission.publicationId);
        await ids.assignButton().click();
        await ids.save();
        confirmation = await openConfirmation(page, tag);
        await expect(confirmation.window).toContainText(TEXT.urnWillBe(urn));
        await confirmation.publish.confirmPublish(confirmation.window, 'Publish');
        await expect(page.getByRole('button', {name: 'Unpublish', exact: true})).toBeVisible({timeout: 30_000});

        // The reader's page: "URN" and the resolver link (Rule 21; Settings
        // bullet 6). Control of the plugin switch and of "Reassign URNs".
        const reader = await readerPage(browser, baseURL);
        const articleUrl = `/index.php/${tag}/article/view/${sid}`;
        const expectUrnLink = async () => {
            await reader.goto(articleUrl);
            await expect(articleUrnHeading(reader)).toBeVisible({timeout: 30_000});
            await expect(readerUrnLinks(reader)).toHaveText(`${RESOLVER}${urn}`);
            await expect(readerUrnLinks(reader)).toHaveAttribute('href', `${RESOLVER}${urn}`);
        };
        const expectNoUrn = async () => {
            await reader.goto(articleUrl);
            await expect(reader.getByRole('heading', {name: 'Section', exact: true})).toBeVisible({timeout: 30_000});
            await expect(articleUrnHeading(reader)).toHaveCount(0);
            await expect(readerUrnLinks(reader)).toHaveCount(0);
        };
        await expectUrnLink();

        // The plugin switched off: no URN on the article's page, no
        // "Identifiers" under the published version; on again, the link is
        // back (Rule 20; Settings bullet 2).
        const plugins = new UrnPluginSettings(page, tag);
        await plugins.openPlugins();
        await plugins.setEnabled(false);
        await expectNoUrn();
        await frame.gotoEditorial(sid);
        await frame.expandLatestVersionNode();
        await expect(frame.pageLink('Metadata')).toBeVisible();
        await expect(frame.pageLink('Identifiers')).toHaveCount(0);
        await plugins.openPlugins();
        await plugins.setEnabled(true);
        await expectUrnLink();

        // "Reassign URNs": the question, "OK", the window stays with no
        // message; the article's page shows no URN (Rule 18).
        await plugins.openPlugins();
        await plugins.openSettings();
        const question = await plugins.pressReassign();
        await answerQuestion(page, question, 'OK', REASSIGN_REQUEST);
        await expect(plugins.form()).toBeVisible();
        await expect(plugins.formErrors()).toHaveCount(0);
        await expectNoUrn();
    });

    test('S4: type URNs item by item', async ({asUser, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag, {
            plugins: urnPlugin({publication: true, galley: true, suffix: 'customId', checkNo: true}),
        });
        const [first, second] = await Promise.all(
            ['a', 'b'].map((n) =>
                ojsApi.createSubmission({
                    tag: `${tag}${n}`,
                    context: tag,
                    submitter: author,
                    galleys: [{label: 'PDF', file: 'article.pdf'}],
                })
            )
        );
        const {page, frame} = await pageAs(asUser, manager, tag);
        const ids = new IdentifiersPage(page, frame);
        const galleys = new GalleysPage(page, frame);

        // The typed box: plain, the help, "Add Check Number" greyed while
        // empty (Fields, the article's "Identifiers" page).
        await ids.open(first.submissionId, first.publicationId);
        await expect(ids.box()).toBeEnabled();
        await expect(ids.box()).toHaveValue('');
        await expect(ids.field()).toContainText(TEXT.mustBegin(PREFIX));
        await expect(ids.addCheckNumberButton()).toBeDisabled();

        // Without the prefix: refused under the box; nothing kept (Rule 11).
        await ids.box().fill('e2e2');
        await ids.saveRefused();
        await expect(ids.fieldError(TEXT.mustBegin(PREFIX))).toBeVisible({timeout: 30_000});
        await ids.open(first.submissionId, first.publicationId);
        await expect(ids.box()).toHaveValue('');

        // With a check number: one digit added, saved, kept (Rule 10; the
        // digit's value is A6's).
        await ids.box().fill(`${PREFIX}abc`);
        await ids.addCheckNumberButton().click();
        await expect(ids.box()).toHaveValue(new RegExp(`^${PREFIX}abc\\d$`));
        const firstUrn = await ids.box().inputValue();
        await ids.save();
        await ids.open(first.submissionId, first.publicationId);
        await expect(ids.box()).toHaveValue(firstUrn);

        // Another article's URN: refused (Rule 11).
        await ids.open(second.submissionId, second.publicationId);
        await ids.box().fill(firstUrn);
        await ids.saveRefused();
        await expect(ids.fieldError(TEXT.suffixInUse)).toBeVisible({timeout: 30_000});

        // A galley's suffix: the individual area; "g1" saved, then the
        // preview with the ticked box; saved again, the URN assigned
        // (Rules 12, 13; Fields, the "Identifiers" tab).
        await galleys.open(first.submissionId, first.publicationId);
        let tab = await galleys.openIdentifiers('PDF');
        await expect(tab.urnArea()).toContainText(TEXT.suffixIntro);
        await expect(tab.urnPrefixBox()).toBeDisabled();
        await expect(tab.urnPrefixBox()).toHaveValue(PREFIX);
        await expect(tab.urnSuffixBox()).toBeEditable();
        await expect(tab.addCheckNumberButton()).toBeVisible();
        await expect(tab.urnArea()).toContainText(TEXT.suffixMissing);
        await tab.urnSuffixBox().fill('g1');
        await tab.save();
        tab = await galleys.openIdentifiers('PDF');
        await expect(tab.urnArea()).toContainText(TEXT.preview);
        await expect(tab.assignBox()).toBeChecked();
        await expect(tab.urnArea()).toContainText('Assign the URN');
        await expect(tab.urnArea()).toContainText('to this galley');
        await tab.save();
        tab = await galleys.openIdentifiers('PDF');
        await expect(tab.urnArea()).toContainText(`${PREFIX}g1`);
        await expect(tab.urnArea()).toContainText(TEXT.assigned('galley'));
        await expect(tab.clearLink()).toBeVisible();
        await tab.close();

        // A suffix another galley uses: refused, "g1" kept, the window open
        // (Rule 12).
        await galleys.open(second.submissionId, second.publicationId);
        tab = await galleys.openIdentifiers('PDF');
        await tab.urnSuffixBox().fill('g1');
        await tab.saveRefused();
        await expect(tab.form()).toContainText(TEXT.suffixInUse);
        await expect(tab.urnSuffixBox()).toHaveValue('g1');
        await tab.close();

        // Control: a URN nobody has is saved on the second article (Rules 10, 11).
        await ids.open(second.submissionId, second.publicationId);
        await ids.box().fill(`${PREFIX}xyz`);
        await ids.save();
        await ids.open(second.submissionId, second.publicationId);
        await expect(ids.box()).toHaveValue(`${PREFIX}xyz`);
    });

    test('S5: a galley\'s URN from the default pattern', async ({asUser, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s5', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag, {
            enablePublisherId: ['galley'],
            issues: [{volume: 1, number: 2, year: 2026, published: true}],
            plugins: urnPlugin({publication: true, galley: true, checkNo: true}),
        });
        const submission = await ojsApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            galleys: [{label: 'PDF', file: 'article.pdf'}],
        });
        const sid = submission.submissionId;
        const galleyUrn = new RegExp(`${PREFIX}jpk\\.v1i2\\.${sid}\\.g${submission.galleys[0].id}\\d`);
        const {page, frame} = await pageAs(asUser, manager, tag);
        const galleys = new GalleysPage(page, frame);

        // A piece missing: "Publisher ID", and the pattern with its issue
        // placeholders unfilled (Rule 12).
        await galleys.open(sid, submission.publicationId);
        let tab = await galleys.openIdentifiers('PDF');
        await expect(tab.publisherIdBox()).toBeVisible();
        await expect(tab.urnArea()).toContainText(TEXT.unresolved);
        await expect(tab.urnArea()).toContainText('%v');
        await expect(tab.urnArea()).toContainText('%i');
        await tab.close();

        // Assigned to an issue: the URN with its check digit, the preview,
        // the ticked box (Rules 8, 12; Settings bullet 5).
        await assignToIssue(page, frame, tag, submission);
        await galleys.open(sid, submission.publicationId);
        tab = await galleys.openIdentifiers('PDF');
        await expect(tab.urnArea()).toContainText(galleyUrn);
        await expect(tab.urnArea()).toContainText(TEXT.preview);
        await expect(tab.assignBox()).toBeChecked();
        await expect(tab.urnArea()).toContainText('to this galley');
        const urn = /** @type {RegExpMatchArray} */ ((await tab.urnArea().innerText()).match(galleyUrn))[0];

        // A publisher ID save assigns the URN too (Rules 12, 13).
        await tab.publisherIdBox().fill('pid-g3');
        await tab.save();
        tab = await galleys.openIdentifiers('PDF');
        await expect(tab.publisherIdBox()).toHaveValue('pid-g3');
        await expect(tab.urnArea()).toContainText(urn);
        await expect(tab.urnArea()).toContainText(TEXT.assigned('galley'));
        await expect(tab.clearLink()).toBeVisible();
        await tab.close();

        // The confirmation window: the table, "Publication" unassigned with
        // the warning sign, "Galley: PDF" with the URN (Rule 17).
        let confirmation = await openConfirmation(page, tag);
        const table = publishUrnTable(confirmation.window);
        await expect(table.getByRole('columnheader')).toHaveText(['URN', 'Item']);
        const publicationRow = publishUrnRow(confirmation.window, 'Publication');
        await expect(publicationRow).toContainText(TEXT.unassigned);
        await expect(publicationRow.locator('.fa-exclamation-triangle')).toHaveCount(1);
        await expect(publishUrnRow(confirmation.window, 'Galley: PDF')).toContainText(urn);
        await confirmation.publish.closeWindow(confirmation.window);

        // "Clear": "Cancel" keeps the URN; "OK" removes it at once; opened
        // again, the preview and the ticked box are back (Rule 14; the tab
        // before the reopen is A14's).
        await galleys.open(sid, submission.publicationId);
        tab = await galleys.openIdentifiers('PDF');
        let question = await tab.pressClear(tab.clearLink(), TEXT.clearQuestion);
        await expect(page.getByRole('dialog', {name: 'Delete', exact: true})).toBeVisible();
        await answerQuestion(page, question, 'Cancel');
        await expect(tab.urnArea()).toContainText(TEXT.assigned('galley'));
        question = await tab.pressClear(tab.clearLink(), TEXT.clearQuestion);
        await answerQuestion(page, question, 'OK', CLEAR_REQUEST);
        await tab.close();
        tab = await galleys.openIdentifiers('PDF');
        await expect(tab.urnArea()).toContainText(TEXT.preview);
        await expect(tab.assignBox()).toBeChecked();
        await tab.close();

        // Control: the confirmation window's "Galley: PDF" row now reads
        // "Unassigned" (Rule 17).
        confirmation = await openConfirmation(page, tag);
        await expect(publishUrnRow(confirmation.window, 'Galley: PDF')).toContainText(TEXT.unassigned);
        await confirmation.publish.closeWindow(confirmation.window);
    });

    test('S6: an issue\'s URN', async ({asUser, ojsApi, browser, baseURL}, testInfo) => {
        test.setTimeout(360_000);
        const tag = makeTag('s6', testInfo);
        const {manager, author, response} = await seedJournal(ojsApi, tag, {
            enablePublisherId: ['issue'],
            issues: [
                {volume: 1, number: 2, year: 2026},
                {volume: 1, number: 3, year: 2026},
            ],
            plugins: urnPlugin({issue: true, publication: true, galley: true}),
        });
        const issueId = (number) => response.issues.find((i) => String(i.number) === String(number)).id;
        const submission = await ojsApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            galleys: [{label: 'PDF', file: 'article.pdf'}],
        });
        const issueUrn = `${PREFIX}jpk.v1i2`;
        const {page, frame} = await pageAs(asUser, manager, tag);
        const issues = new IssuesPage(page, tag);
        const ids = new IdentifiersPage(page, frame);
        const galleys = new GalleysPage(page, frame);
        const reader = await readerPage(browser, baseURL);

        // The issue's "Identifiers" tab: after "Issue Galleys"; "Publisher
        // ID", the URN area with the preview and the ticked box, and below
        // it the "Clear Issue Objects URNs" block (Rules 8, 12, 15).
        await issues.open();
        let tab = await issues.openEdit(ISSUE_2);
        expect(await tab.tabNames()).toEqual(['Table of Contents', 'Issue Data', 'Issue Galleys', 'Identifiers']);
        await tab.openIdentifiersTab();
        await expect(tab.publisherIdBox()).toBeVisible();
        await expect(tab.form().getByRole('group', {name: 'URN'})).toBeVisible();
        await expect(tab.urnArea()).toContainText(issueUrn);
        await expect(tab.urnArea()).toContainText(TEXT.preview);
        await expect(tab.assignBox()).toBeChecked();
        await expect(tab.urnArea()).toContainText('to this issue');
        await expect(tab.objectsArea()).toContainText(TEXT.issueObjectsIntro);
        await expect(tab.clearIssueObjectsLink()).toBeVisible();
        const areaBox = await tab.urnArea().boundingBox();
        const objectsBox = await tab.objectsArea().boundingBox();
        expect(objectsBox?.y).toBeGreaterThan(areaBox?.y ?? Infinity);
        await tab.close();

        // "Publish Issue": the ticked box naming the URN; "OK" (Rule 16).
        // The email box is the issue feature's; unticked so no job is queued.
        await issues.open();
        let publishIssue = await issues.openPublishIssue(ISSUE_2);
        await expect(publishIssue.dialog()).toContainText(TEXT.publishIssueQuestion);
        await expect(publishIssue.urnArea()).toContainText(TEXT.assignIssueUrn(issueUrn));
        await expect(publishIssue.assignBox()).toBeChecked();
        await publishIssue.mailBox().uncheck();
        await publishIssue.ok();

        // The issue's page, signed out: "URN:" with the resolver link; back
        // on Issues, the tab shows the URN assigned (Rules 12, 21).
        const issuePageUrl = (number) => `/index.php/${tag}/issue/view/${issueId(number)}`;
        await reader.goto(issuePageUrl(2));
        await expect(reader.getByText(`URN: ${RESOLVER}${issueUrn}`)).toBeVisible({timeout: 30_000});
        await expect(readerUrnLinks(reader)).toHaveText(`${RESOLVER}${issueUrn}`);
        await expect(readerUrnLinks(reader)).toHaveAttribute('href', `${RESOLVER}${issueUrn}`);
        await issues.open({back: true});
        tab = await issues.openIdentifiers(ISSUE_2);
        await expect(tab.urnArea()).toContainText(issueUrn);
        await expect(tab.urnArea()).toContainText(TEXT.assigned('issue'));
        await expect(tab.clearLink()).toBeVisible();
        await tab.close();

        // An article with its URN in the issue: assigned, the article's URN
        // saved, the galley's assigned by a plain "Save" (Rules 9, 13).
        await assignToIssue(page, frame, tag, submission);
        await ids.open(submission.submissionId, submission.publicationId);
        await ids.assignButton().click();
        await ids.save();
        await ids.open(submission.submissionId, submission.publicationId);
        await expect(ids.box()).toHaveValue(`${issueUrn}.${submission.submissionId}`);
        await galleys.open(submission.submissionId, submission.publicationId);
        let galleyTab = await galleys.openIdentifiers('PDF');
        await expect(galleyTab.assignBox()).toBeChecked();
        await galleyTab.save();
        galleyTab = await galleys.openIdentifiers('PDF');
        await expect(galleyTab.urnArea()).toContainText(TEXT.assigned('galley'));
        await galleyTab.close();

        // "Clear Issue Objects URNs": the question, "OK"; the article's box
        // empty with "Assign", the galley's preview back (Rule 15).
        await issues.open({back: true});
        tab = await issues.openIdentifiers(ISSUE_2);
        let question = await tab.pressClear(tab.clearIssueObjectsLink(), TEXT.clearIssueObjectsQuestion);
        await answerQuestion(page, question, 'OK', CLEAR_ISSUE_OBJECTS_REQUEST);
        await tab.close();
        await ids.open(submission.submissionId, submission.publicationId);
        await expect(ids.box()).toHaveValue('');
        await expect(ids.assignButton()).toBeVisible();
        await galleys.open(submission.submissionId, submission.publicationId);
        galleyTab = await galleys.openIdentifiers('PDF');
        await expect(galleyTab.urnArea()).toContainText(TEXT.preview);
        await expect(galleyTab.assignBox()).toBeChecked();
        await galleyTab.close();

        // The issue's own "Clear": "Cancel" keeps it; "OK" shows the preview
        // and the ticked box at once; the issue's page shows no "URN:"
        // ("Published:" the control) (Rules 14, 21).
        await issues.open({back: true});
        tab = await issues.openIdentifiers(ISSUE_2);
        question = await tab.pressClear(tab.clearLink(), TEXT.clearQuestion);
        await expect(page.getByRole('dialog', {name: 'Delete', exact: true})).toBeVisible();
        await answerQuestion(page, question, 'Cancel');
        await expect(tab.urnArea()).toContainText(TEXT.assigned('issue'));
        question = await tab.pressClear(tab.clearLink(), TEXT.clearQuestion);
        await answerQuestion(page, question, 'OK', CLEAR_REQUEST);
        await expect(tab.urnArea()).toContainText(TEXT.preview);
        await expect(tab.assignBox()).toBeChecked();
        await tab.close();
        await reader.goto(issuePageUrl(2));
        await expect(reader.getByText('Published:')).toBeVisible({timeout: 30_000});
        await expect(reader.getByText('URN:')).toHaveCount(0);
        await expect(readerUrnLinks(reader)).toHaveCount(0);

        // Control: Vol. 1 No. 3 published with its box unticked: published,
        // no "URN:" on its page (Rules 16, 21).
        await issues.open();
        publishIssue = await issues.openPublishIssue(ISSUE_3);
        await expect(publishIssue.urnArea()).toContainText(TEXT.assignIssueUrn(`${PREFIX}jpk.v1i3`));
        await publishIssue.assignBox().uncheck();
        await publishIssue.mailBox().uncheck();
        await publishIssue.ok();
        await reader.goto(issuePageUrl(3));
        await expect(reader.getByText('Published:')).toBeVisible({timeout: 30_000});
        await expect(reader.getByText('URN:')).toHaveCount(0);
        await expect(readerUrnLinks(reader)).toHaveCount(0);
    });
});
