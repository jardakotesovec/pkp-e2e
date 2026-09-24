// @ts-check
/**
 * @file playwright/tests/U44-identifiers.spec.js
 *
 * Identifiers (publisher IDs & URN) — OMP suite, one test per canonical
 * scenario the spec runs on a press (S1 common; S2–S4 {OJS OMP}; S5, S6
 * {OJS} and S7 {OPS} are the other apps'), in the press's own words: the
 * Press Manager, a monograph, "Press Content", "Monographs", the "Publish"
 * button. The journal-only bullets inside the common scenarios (galleys,
 * the issue step, the reader's article page) have no press leg here; a
 * press offers "Assign" from the start (S3).
 * Spec: docs/specs/U44-identifiers.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - OMP4 🐞: S3's confirmation window is read for carrying no URN before
 *   the assign and the URN after it, never for its table or a line.
 * - OMP3 ❓: the book page is not read for the monograph's URN either way.
 * - U24's OMP3 🐞 (a press keeps listing "Identifiers" with the plugin
 *   off): S3 reads the switched-off plugin as no URN box at the page's
 *   address, never whether the page is listed.
 * - A9 🐞: S3's Layout Editor is read for the greyed "Save" only; the
 *   "Assign" that page offers is not asserted.
 * - A6 🐞: S4's "Add Check Number" is read as one digit added, never its
 *   value.
 * - A10 🐞: S2 reads the prefix refusal at the top of the window only.
 * - A4 🐞: no "Save" on the "Identifiers" page runs with the stored URN
 *   still in the box.
 * - A2, A3, A5, A7, A8, A11, A12, A13, A14, OMP1, OMP2, OMP5, OMP6: not on
 *   these scenarios' press paths. OJS1–OJS3: the journal's, in that tree.
 *
 * Seeding: scenario endpoints only; publicknowledge is never touched. Every
 * scenario runs on its own scratch press with throwaway accounts (the
 * username twice as password), as footnote s says: `context.acronym` PKP,
 * `plugins.urnpubidplugin` with every key the press's settings window
 * writes (`urnCheckNo` always), the submission's `participants[]`. S3's
 * monograph is seeded in Production (`files[]`, `skipExternalReview`,
 * `sendToProduction`): at the Submission stage the Layout Editor's
 * Publication area is empty on a press as on a journal (T-ojs-1). S1 and
 * S2 change the settings on screen because those screens are what they
 * test.
 *
 * Every absence is read settled and paired with a positive control taken
 * the same way (M4, M6); S1's mailbox silence is bounded by a discussion
 * the Press Manager opens with a spare account of its own press (A8).
 * Browser dialogs are accepted and recorded on every page. Waits are
 * web-first or bounded by the screen's own answer (A5). Everything runs in
 * the parallel `omp` project: the URN plugin and the settings are per
 * scratch press.
 */
const {test, expect} = require('../support/fixtures.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {ActivityLogWindow} = require('../../../../shared/playwright/pages/ActivityLogPages.js');
const {
    IDENTIFIERS_TEXT: TEXT,
    PublisherIdSettings,
    UrnPluginSettings,
    IdentifiersPage,
    answerQuestion,
    pastCloseWindow,
    REASSIGN_REQUEST,
} = require('../../../../shared/playwright/pages/IdentifiersPages.js');

const PREFIX = 'urn:nbn:de:0000-';
const RESOLVER = 'https://nbn-resolving.de/';
const METADATA_EVENT = 'Submission metadata updated';
const PRESS_BOXES = ['Enable for Monographs', 'Enable for Chapters', 'Enable for Publication Formats', 'Enable for Files'];
const URN_WINDOW_INTRO = 'Please configure the URN plug-in to be able to manage and use URNs in OMP:';
const URN_KINDS = ['Monographs', 'Chapters', 'Publication Formats', 'Files'];
const DEFAULT_PATTERNS = [
    '%p.%m for monographs',
    '%p.%m.c%c for chapters',
    '%p.%m.%f for publication formats',
    '%p.%m.%f.%s for files',
];
const NAMESPACES = ['', 'urn:nbn:de', 'urn:nbn:at', 'urn:nbn:ch', 'urn:nbn', 'urn'];

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u44${scenario}omw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: mailOf(username), roles};
}

/**
 * The URN plugin's `plugins` entry with every key the press's settings
 * window writes (scenarios.md: without `urnCheckNo` the "Identifiers" page
 * arrives empty).
 */
function urnPlugin({suffix = 'default', checkNo = false} = {}) {
    return {
        urnpubidplugin: {
            enabled: true,
            settings: {
                enablePublicationURN: true,
                enableChapterURN: false,
                enableRepresentationURN: false,
                enableSubmissionFileURN: false,
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
 * Seed a scratch press (initials "PKP") with a throwaway Press Manager and
 * Author, and `extra` accounts; returns the usernames.
 */
async function seedPress(ompApi, tag, {extra = [], ...keys} = {}) {
    const users = [user(`${tag}mg`, 'Mona', 'Manager', ['manager']), user(`${tag}au`, 'Ada', 'Author', ['author']), ...extra];
    await ompApi.createContext({tag, context: {acronym: 'PKP'}, users, ...keys});
    return {manager: `${tag}mg`, author: `${tag}au`};
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
 * Add a discussion on the open workflow's stage with one participant
 * ticked; the participant gets the "new discussion" email (the mailbox
 * bullet's positive control, A8; U42's OMP shape).
 */
async function addDiscussion(page, {name, participantUsername, message}) {
    const panel = page.locator('[data-cy="discussion-manager"]').first();
    await expect(panel.getByRole('heading', {name: /Tasks & Discussions$/})).toBeVisible({timeout: 30_000});
    await panel.getByRole('button', {name: 'Add', exact: true}).click();
    const modal = page.locator('[data-cy="active-modal"]').filter({has: page.locator('input[name="title"]')});
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

/**
 * Press the header's "Publish" and return the confirmation window
 * ("Schedule For Publication" on a press too), settled on its
 * requirements line. The first press is occasionally swallowed (U49
 * fn-k), so it is repeated once when the window has not appeared.
 */
async function openConfirmation(page) {
    const button = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: 'Publish', exact: true});
    const window = page.getByRole('dialog', {name: /Schedule For Publication/});
    await expect(button).toBeVisible({timeout: 30_000});
    await button.click();
    try {
        await expect(window).toBeVisible({timeout: 5_000});
    } catch {
        await button.click();
    }
    await expect(window).toBeVisible({timeout: 30_000});
    await expect(window).toContainText('All publication requirements have been met.', {timeout: 30_000});
    await expect(window.getByRole('button', {name: 'Publish', exact: true})).toBeVisible();
    return window;
}

/** Close the confirmation window without confirming; wait out the close slot (patterns.md pitfall 4). */
async function closeConfirmation(page, window) {
    await window.getByRole('button', {name: 'Close', exact: true}).last().click();
    await expect(window).toBeHidden({timeout: 30_000});
    await pastCloseWindow(page);
}

test.describe('identifiers', () => {
    test('S1: switch publisher IDs on and type them', {tag: '@smoke'}, async ({asUser, ompApi, pkpMail}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s1', testInfo);
        const spare = `${tag}x`;
        const {manager, author} = await seedPress(ompApi, tag, {
            extra: [user(spare, 'Xena', 'Spare', ['author'])],
        });
        const [submission, control] = await Promise.all([
            ompApi.createSubmission({tag, context: tag, submitter: author}),
            ompApi.createSubmission({tag: `${tag}c`, context: tag, submitter: spare}),
        ]);
        const {page, frame} = await pageAs(asUser, manager, tag);
        const ids = new IdentifiersPage(page, frame);
        const settings = new PublisherIdSettings(page, tag);

        // Control: before the first "Save" on Settings the Metadata page
        // shows no "Publisher ID" (Rules 1, 2).
        await openMetadata(frame, submission);
        await expect(ids.metadataPublisherIdBox()).toHaveCount(0);

        // The "Publisher ID" boxes: the help text and the press's four
        // boxes, all unticked; tick "Enable for Monographs", "Save"
        // (Fields; Settings bullet 1).
        await settings.open();
        await expect(settings.group()).toContainText(TEXT.publisherIdHelp);
        await expect
            .poll(() => settings.boxes(), {timeout: 30_000})
            .toEqual(PRESS_BOXES.map((label) => ({label, checked: false})));
        await settings.setBoxes({'Enable for Monographs': true});
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

        // The Activity Log: one "Submission metadata updated" line more,
        // from the Metadata page, and nothing else (Side effects).
        const logAfter = await activityLogCounts(page, frame);
        expect(logAfter.metadata).toBe(logBefore.metadata + 1);
        expect(logAfter.total).toBe(logBefore.total + 1);

        // No email about the save: bounded by the one mail the test sends
        // itself the same way, a discussion with the spare on the spare's
        // own monograph (Side effects; A8).
        const discussion = `Control ${tag}`;
        await frame.gotoEditorial(control.submissionId);
        await addDiscussion(page, {name: discussion, participantUsername: spare, message: `Control message ${tag}.`});
        const afterControl = {to: mailOf(spare), subject: discussion};
        await pkpMail.expectNone({to: mailOf(author), afterControl});
        // The Press Manager opened the discussion and is on it: its copy of
        // the control is its only mail.
        await expect.poll(() => pkpMail.count({to: mailOf(manager), subject: discussion}), {timeout: 20_000}).toBe(1);
        expect(await pkpMail.count({to: mailOf(manager)})).toBe(1);

        // Switched off: no "Publisher ID" on the Metadata page (its
        // "Keywords" the control) (Rule 2; Settings bullet 1).
        await settings.open();
        await settings.setBoxes({'Enable for Monographs': false});
        await settings.save();
        await openMetadata(frame, submission);
        await expect(ids.metadataPublisherIdBox()).toHaveCount(0);

        // On again: the value is back (Rule 2).
        await settings.open();
        await settings.setBoxes({'Enable for Monographs': true});
        await settings.save();
        await openMetadata(frame, submission);
        await expect(ids.metadataPublisherIdBox()).toHaveValue('pid-a1');
    });

    test('S2: configure the URN plugin', async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s2', testInfo);
        const {manager, author} = await seedPress(ompApi, tag);
        const submission = await ompApi.createSubmission({tag, context: tag, submitter: author});
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

        // The window as it opens: the press's intro, "Press Content" kinds,
        // default patterns, the Namespace list without "urn:nbn:fi" (Fields;
        // Settings bullets 3–5).
        await plugins.openSettings();
        await expect(page.getByRole('dialog', {name: 'URN', exact: true})).toBeVisible();
        await expect(plugins.window()).toContainText(URN_WINDOW_INTRO);
        await expect(plugins.form()).toContainText('Press Content');
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
        await plugins.setKind('Monographs', true);
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
        await plugins.setKind('Monographs', false);
        await plugins.saveRefusedByServer();
        await expect(plugins.formErrors()).toContainText('Errors occurred processing this form:');
        await expect(plugins.formErrorItems()).toHaveText([TEXT.noKind]);

        // Saved: the window closes with the notice (Fields).
        await plugins.setKind('Monographs', true);
        await plugins.saveAccepted();

        // The other side: the version now lists "Identifiers" (Rule 7).
        await workflow.frame.gotoEditorial(submission.submissionId);
        await workflow.frame.expandLatestVersionNode();
        await expect(workflow.frame.pageLink('Identifiers')).toBeVisible();
    });

    test('S3: assign a monograph\'s URN and publish it', async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s3', testInfo);
        const layoutEditor = `${tag}le`;
        const {manager, author} = await seedPress(ompApi, tag, {
            extra: [user(layoutEditor, 'Leo', 'Layout', ['layoutEditor'])],
            plugins: urnPlugin(),
        });
        const submission = await ompApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            // In Production: at the Submission stage the Layout Editor's
            // Publication area is empty (T-ojs-1; the same on a press).
            files: [{file: 'article.pdf'}],
            decisions: ['skipExternalReview', 'sendToProduction'],
            participants: [{username: layoutEditor, role: 'layoutEditor'}],
        });
        const sid = submission.submissionId;
        const identifiersKey = `publication_${submission.publicationId}_identifiers`;
        const urn = `${PREFIX}pkp.${sid}`;
        const {page, frame, asked} = await pageAs(asUser, manager, tag);
        const ids = new IdentifiersPage(page, frame);

        // A press needs no issue: a greyed box offering "Assign" from the
        // start, and no issue message (Rule 9).
        await ids.open(sid, submission.publicationId);
        await expect(ids.box()).toBeDisabled();
        await expect(ids.box()).toHaveValue('');
        await expect(ids.assignButton()).toBeVisible();
        await expect(ids.field()).not.toContainText(TEXT.noIssue);

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

        // No URN in the confirmation window: read for carrying no URN, its
        // URN part rendered ("URN" in it either way; OMP4 not asserted);
        // closed without confirming (Rule 17).
        let window = await openConfirmation(page);
        await expect(window).toContainText('URN');
        await expect(window).not.toContainText(PREFIX);
        await closeConfirmation(page, window);

        // The URN in the confirmation window, then published (Rule 17).
        await ids.open(sid, submission.publicationId);
        await ids.assignButton().click();
        await ids.save();
        window = await openConfirmation(page);
        await expect(window).toContainText(urn);
        const published = page.waitForResponse((r) => r.url().includes('/publish') && r.ok(), {timeout: 30_000});
        await window.getByRole('button', {name: 'Publish', exact: true}).click();
        await published;
        await expect(page.getByRole('button', {name: 'Unpublish', exact: true})).toBeVisible({timeout: 30_000});

        // Control before the switch: the published version's "Identifiers"
        // page holds the URN (Rules 20, 21).
        await ids.open(sid, submission.publicationId);
        await expect(ids.box()).toHaveValue(urn);

        // The plugin switched off: no URN box at the page's address, whether
        // or not the page is still listed (U24 OMP3); read once the page the
        // address lands on has loaded (Rule 20; Settings bullet 2).
        const plugins = new UrnPluginSettings(page, tag);
        await plugins.openPlugins();
        await plugins.setEnabled(false);
        const fields = page
            .waitForResponse((r) => /\/_components\/identifier/.test(r.url()), {timeout: 30_000})
            .catch(() => null);
        await frame.gotoEditorial(sid, {menuKey: identifiersKey});
        await expect(frame.heading()).toHaveText(/^Publication: /i, {timeout: 30_000});
        if (/Identifiers$/i.test(await frame.heading().innerText())) {
            expect(await fields, 'the Identifiers page fetched its fields').not.toBeNull();
        }
        await expect(ids.field()).toHaveCount(0);

        // On again: the "Identifiers" page holds the URN again (Rule 20).
        await plugins.openPlugins();
        await plugins.setEnabled(true);
        await ids.open(sid, submission.publicationId);
        await expect(ids.box()).toHaveValue(urn);

        // "Reassign URNs": the question, "OK", the window stays with no
        // message; the "Identifiers" page's box is empty (Rule 18).
        await plugins.openPlugins();
        await plugins.openSettings();
        const question = await plugins.pressReassign();
        await answerQuestion(page, question, 'OK', REASSIGN_REQUEST);
        await expect(plugins.form()).toBeVisible();
        await expect(plugins.formErrors()).toHaveCount(0);
        await ids.open(sid, submission.publicationId);
        await expect(ids.box()).toHaveValue('');
        await expect(ids.assignButton()).toBeVisible();
    });

    test('S4: type URNs item by item', async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s4', testInfo);
        const {manager, author} = await seedPress(ompApi, tag, {
            plugins: urnPlugin({suffix: 'customId', checkNo: true}),
        });
        const [first, second] = await Promise.all(
            ['a', 'b'].map((n) => ompApi.createSubmission({tag: `${tag}${n}`, context: tag, submitter: author}))
        );
        const {page, frame} = await pageAs(asUser, manager, tag);
        const ids = new IdentifiersPage(page, frame);

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

        // Another monograph's URN: refused (Rule 11).
        await ids.open(second.submissionId, second.publicationId);
        await ids.box().fill(firstUrn);
        await ids.saveRefused();
        await expect(ids.fieldError(TEXT.suffixInUse)).toBeVisible({timeout: 30_000});

        // Control: a URN nobody has is saved on the second monograph (Rules
        // 10, 11).
        await ids.open(second.submissionId, second.publicationId);
        await ids.box().fill(`${PREFIX}xyz`);
        await ids.save();
        await ids.open(second.submissionId, second.publicationId);
        await expect(ids.box()).toHaveValue(`${PREFIX}xyz`);
    });
});
