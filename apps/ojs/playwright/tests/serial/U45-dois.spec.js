// @ts-check
/**
 * @file playwright/tests/serial/U45-dois.spec.js
 *
 * DOIs — the OJS scenarios that cannot run beside the parallel suite.
 *
 * S11, S15 and S22 put a scratch journal on "DOI Versioning" "Yes", and while
 * any journal of the install is set so on an OJS checkout older than
 * `2815f33e65` (pkp/ojs#5947, which fixed U19 A22 on `main` on 2026-10-16),
 * every OJS OAI request answers 500 on PostgreSQL. The app repos' PR checks
 * run this suite against each PR's own head, and most open pkp/ojs PRs
 * predate that fix (99 of 100 on 2026-10-19), so beside U19 in the
 * parallel `ojs` project it would red their U19 run. Here they run after it, and
 * each sets its journal back to "No" on screen in a `finally`, so a
 * failed assertion cannot leave the install's OAI failing.
 *
 * S13 and S16 run the site's background jobs after their deposits with
 * `runJobs()` and read "Error" after it (Rule 33, footnote sc), which only
 * the serial project may do (patterns.md parallel lesson 7). Every
 * deposit of S13, S16 and S22 is first read "Submitted", before any run:
 * another serial test's drain would turn it "Error" under the read, so the
 * three carry `@solo` and run alone in `ojs-solo` (S11 and S15 deposit
 * nothing and stay in `ojs-serial`). S13's "Failed Jobs" lists every job
 * of the fleet: the test runs the jobs once before seeding, so what an
 * earlier run left queued has failed or gone before the list is noted.
 * Spec: docs/specs/U45-dois.md
 *
 * Coverage boundaries are declared in the parallel suite's header
 * (playwright/tests/U45-dois.spec.js); this file adds only:
 * - S11 reads the "View all" window's block headings by the version's
 *   name and the words after it ("(date)" / "Unpublished"), never the date
 *   itself;
 * - S15's Crossmark button is read as the side column's last block with
 *   the logo named "Crossmark"; the window it opens (Crossref's own site)
 *   is not pressed.
 *
 * Seeding: scenario endpoints only, a scratch journal with a throwaway
 * Journal Manager and the Authors "Ada Lovelace" and (S13, S16) "Mary
 * Anning" (footnote sc): `doiPrefix`, `doiVersioning`, the Crossref and
 * DataCite plugins with Crossref's depositor fields and
 * `registrationAgency`, `publisherInstitution` / `onlineIssn` (S13, S22),
 * works seeded `published` (with `galleys[]`) or sent to Production
 * (`decisions[]`); "Create New Version", the publishes and the DataCite
 * choice (S16) are pressed on screen. The typed DOI carries the run's tag
 * (Rule 9). S13's Site Administrator is the installer's `admin`.
 */
const {test, expect} = require('../../support/fixtures.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');
const {FailedJobsPage} = require('../../../../../shared/playwright/pages/AdminPages.js');
const {ArticleLandingPage} = require('../../../../../shared/playwright/pages/ArticleLandingPages.js');
const {
    DOIS_TEXT: TEXT,
    DoiSettings,
    DoisPage,
    recordNotices,
    defaultDoiPattern,
    readerDoiItem,
    readerDoiLink,
    crossmarkBlock,
} = require('../../../../../shared/playwright/pages/DoisPages.js');
const {PublishScreen} = require('../../pages/PublishSchedulePages.js');
const {PublicationScreen} = require('../../pages/PublicationMetadataPages.js');

const PREFIX = '10.1234';
const MADE = defaultDoiPattern(PREFIX);
const ARTICLE = 'Article';
const AXOLOTL = 'Axolotl limb memory';
const TARDIGRADE = 'Tardigrade desiccation';
const CORAL = 'Coral spawning';
const MOSS = 'Moss regrowth';
const GALLEYS = 'Article galleys, such as a published PDF';
const DATACITE_KINDS = ['Articles', 'Issues', GALLEYS];
const TO_PRODUCTION = ['skipExternalReview', 'sendToProduction'];
const CROSSREF_CURL = 'cURL error 7: Failed to connect to api.crossref.org port 443';
const DATACITE_TEST_CURL = 'cURL error 7: Failed to connect to mds.test.datacite.org port 443';
const DEPOSITOR = {depositorName: 'Public Knowledge Project', depositorEmail: 'doi@mail.test'};
const VERSIONING_YES = 'Yes, assign a unique DOI to every version of an article.';
const VERSIONING_NO = 'No, all versions of an article should have the same DOI.';
const CROSSMARK_SENTENCE =
    'Enable participation in Crossmark to allow readers to check the publication status of articles. Learn more.';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u45${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: mailOf(username), roles};
}

/**
 * Seed a scratch journal with a throwaway Journal Manager and Author
 * ("Ada Lovelace"), and with `mary` the Author "Mary Anning" too.
 */
async function seedJournal(ojsApi, tag, keys, {mary = false} = {}) {
    const users = [user(`${tag}mg`, 'Mona', 'Manager', ['manager']), user(`${tag}al`, 'Ada', 'Lovelace', ['author'])];
    if (mary) users.push(user(`${tag}ma`, 'Mary', 'Anning', ['author']));
    await ojsApi.createContext({tag, users, ...keys});
    return {manager: `${tag}mg`, ada: `${tag}al`, mary: mary ? `${tag}ma` : null};
}

/** A page as `username`, every browser dialog accepted. */
async function pageAs(asUser, username) {
    const page = await (await asUser(username)).newPage();
    page.on('dialog', (dialog) => {
        dialog.accept().catch(() => {});
    });
    await recordNotices(page);
    return page;
}

/** A signed-out reader page (an explicit empty state, patterns.md lesson 8). */
async function readerPage(browser, baseURL) {
    const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
    return context.newPage();
}

/** A version's page signed out: its "DOI:" line reads `doi`. */
async function expectReaderDoi(reader, tag, submissionId, doi, {version} = {}) {
    const landing = new ArticleLandingPage(reader, tag);
    await landing.goto(submissionId, version === undefined ? {} : {version});
    await expect(readerDoiItem(reader).locator('h2.label')).toHaveText(/^\s*DOI:\s*$/);
    await expect(readerDoiLink(reader)).toHaveText(`https://doi.org/${doi}`);
}

/**
 * "DOI Versioning" set back to "No" on the Setup tab and saved: the
 * install's OAI answers again on an app head before the U19 A22 fix. Run from a `finally`; a refusal
 * here is reported, not swallowed.
 */
async function restoreVersioningNo(page, tag) {
    const settings = new DoiSettings(page, tag);
    await settings.goto('Setup');
    if (!(await settings.versioningRadio('No').isChecked())) {
        await settings.versioningRadio('No').check();
        await settings.save(settings.setup);
    }
}

/** The publish confirmation window (publish or schedule). */
function publishWindow(page) {
    return page.getByRole('dialog').filter({hasText: /Are you sure you want to (publish|schedule) this/}).last();
}

/**
 * Publish the version open on the workflow: through the "Review
 * Publishing Details" panel when it opens (its empty boxes filled),
 * straight to the confirmation window otherwise.
 */
async function publishOpenVersion(page, tag) {
    const publish = new PublishScreen(page, tag);
    const window = publishWindow(page);
    const panel = await publish.pressPublish({or: window});
    if (panel) {
        for (const [name, value] of [['versionStage', 'VoR'], ['versionIsMinor', 'false']]) {
            const box = panel.locator(`select[name="${name}"]`);
            if ((await box.count()) > 0 && (await box.isVisible()) && !(await box.inputValue())) {
                await box.selectOption(value);
            }
        }
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
    }
    await expect(window).toBeVisible({timeout: 30_000});
    await publish.confirmPublish(window, 'Publish');
    await expect(page.getByRole('button', {name: 'Unpublish', exact: true})).toBeVisible({timeout: 30_000});
}

/**
 * "Create New Version" on the version open, its "Revision Significance"
 * chosen ('false' "Major Revision", 'true' "Minor Revision"); returns the
 * new version's publication id.
 */
async function createVersion(page, tag, isMinor) {
    const publish = new PublishScreen(page, tag);
    const dialog = await publish.openCreateVersionDialog();
    await dialog.locator('select[name="versionStage"]').selectOption('VoR');
    await dialog.locator('select[name="versionIsMinor"]').selectOption(isMinor);
    return publish.confirmVersionDialog(dialog);
}

/**
 * Every DOI row of each named block of the open "View all" window reads
 * `status` (each block's rows counted first, so an empty block fails).
 */
async function expectEveryRow(dois, headings, status) {
    for (const heading of headings) {
        const badges = dois.versionBlock(heading).locator('tbody tr .doiListItem__itemMetadata--badge');
        await expect(badges.first()).toBeVisible({timeout: 30_000});
        const count = await badges.count();
        await expect(badges, `${heading}: every row ${status}`).toHaveText(Array(count).fill(new RegExp(`^\\s*${status}\\s*$`)));
    }
}

/**
 * The mail catcher's silence for `others`, bounded by a positive control:
 * a password reset for the journal's own manager, asked on the journal's
 * "Forgot your password?" page after the actions (A8). The manager's inbox
 * then holds that one message and nothing else.
 */
async function expectNoMailBesidesControl(browser, baseURL, pkpMail, tag, manager, others) {
    const visitor = await readerPage(browser, baseURL);
    await visitor.goto(`/index.php/${tag}/login/lostPassword`);
    await visitor.locator('form#lostPasswordForm input#email').fill(mailOf(manager));
    await visitor.locator('form#lostPasswordForm').getByRole('button', {name: 'Reset Password'}).click();
    await pkpMail.find({to: mailOf(manager), subject: 'Password Reset Confirmation'});
    expect(await pkpMail.count({to: mailOf(manager)}), 'the manager received the control alone').toBe(1);
    for (const other of others) {
        expect(await pkpMail.count({to: mailOf(other)}), `no mail to ${other}`).toBe(0);
    }
    await visitor.context().close();
}

/**
 * Press "Deposit All" and its window's "Deposit all DOIs"; waits for the
 * action's answer (200), the list's refetch and the notice.
 */
async function depositAll(dois) {
    await dois.depositAllButton().click();
    const all = dois.dialog(TEXT.depositAllTitle);
    await expect(all).toBeVisible({timeout: 30_000});
    const response = await dois.confirmAction(all, TEXT.depositAllTitle);
    expect(response.status(), 'Deposit All answers 200').toBe(200);
    await dois.expectNotice(TEXT.depositQueued);
}

/**
 * The list shown holds exactly the works titled `titles`, read settled
 * (the row links' count, then their words, as a set: lesson 14c).
 */
async function expectListedExactly(dois, titles) {
    await expect(dois.rowLink(dois.rows())).toHaveCount(titles.length, {timeout: 30_000});
    const names = await dois.rowNames();
    expect(names.map((n) => n.replace(/^.* — /, '')).sort()).toEqual([...titles].sort());
}

/**
 * Every job the "Failed Jobs" page lists, all its pages, by "ID", read
 * after the page's own list load; the total line under the title counts
 * the same number (the read's positive control).
 */
async function failedJobIds(failed) {
    const rows = await failed.allRows();
    await expect(await failed.totalBold()).toHaveText(String(rows.length));
    return rows.map((row) => String(row.id)).sort();
}

test.describe('DOIs (serial)', () => {
    test('S11: a DOI per major version ("DOI Versioning" "Yes")', async ({browser, baseURL, asUser, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s11', testInfo);
        const {manager, ada} = await seedJournal(ojsApi, tag, {doiPrefix: PREFIX, doiVersioning: true});
        const page = await pageAs(asUser, manager);
        try {
            const axolotl = await ojsApi.createSubmission({tag: `${tag}ax`, context: tag, submitter: ada, title: AXOLOTL, published: true});
            const dois = new DoisPage(page, tag);
            const screen = new PublicationScreen(page, tag);
            const reader = await readerPage(browser, baseURL);
            const changed = `${PREFIX}/e2e-v2-${tag}`;
            const row = dois.row(axolotl.submissionId);

            // Control: before the major version, no "There are … versions."
            // and no "View all" (Rule 20).
            await dois.goto();
            await dois.expand(row, axolotl.submissionId);
            const doi1 = await dois.doiBox(row, ARTICLE).inputValue();
            expect(doi1).toMatch(MADE);
            await expect(dois.editButton(row)).toBeVisible();
            await expect(dois.versionsBar(row)).toHaveCount(0);

            // A major version: "There are 2 versions." with "View all"; the
            // window's blocks, the new one "Unpublished" and already holding
            // a DOI of its own, the published work being at Done (Rules 5,
            // 12, 20).
            await screen.gotoVersionPage(axolotl.submissionId, axolotl.publicationId, 'titleAbstract', 'Title & Abstract');
            const majorId = await createVersion(page, tag, 'false');
            await dois.goto();
            await dois.expand(row, axolotl.submissionId);
            await expect(dois.versionsBar(row)).toContainText('There are 2 versions.');
            await expect(dois.viewAllButton(row)).toBeVisible();
            await dois.openVersionsWindow(row);
            await expect(dois.versionHeadings()).toHaveText([
                /^\s*Version of Record 1\.0 \(.+\)\s*$/,
                /^\s*Version of Record 2\.0 Unpublished\s*$/,
            ]);
            await expect(dois.versionDoiBox(dois.versionBlock('Version of Record 1.0'), ARTICLE)).toHaveValue(doi1);
            await expect(dois.versionDoiBox(dois.versionBlock('Version of Record 2.0'), ARTICLE)).toHaveValue(MADE);
            const doi2 = await dois.versionDoiBox(dois.versionBlock('Version of Record 2.0'), ARTICLE).inputValue();
            expect(doi2).not.toBe(doi1);
            await dois.closeVersionsWindow();

            // Marked registered before its publication: 1.0's DOI reads
            // "Registered", 2.0's keeps "Unregistered" (Rules 20, 26).
            await dois.goto();
            await dois.runBulk('Mark DOIs Registered', [axolotl.submissionId]);
            await dois.expectNotice('Items successfully marked registered');
            await dois.expand(row, axolotl.submissionId);
            await dois.openVersionsWindow(row);
            await expect(dois.versionDoiBadge(dois.versionBlock('Version of Record 1.0'), ARTICLE)).toHaveText(/^\s*Registered\s*$/);
            await expect(dois.versionDoiBadge(dois.versionBlock('Version of Record 2.0'), ARTICLE)).toHaveText(/^\s*Unregistered\s*$/);
            await dois.closeVersionsWindow();

            // The major version published: it keeps the DOI it got at its
            // creation, still "Unregistered"; its page shows it, 1.0's page
            // keeps 1.0's (Rules 12, 26, 43).
            await screen.gotoVersionPage(axolotl.submissionId, majorId, 'titleAbstract', 'Title & Abstract');
            await publishOpenVersion(page, tag);
            await dois.goto();
            await dois.expand(row, axolotl.submissionId);
            await dois.openVersionsWindow(row);
            const block2 = dois.versionBlock('Version of Record 2.0');
            await expect(dois.versionDoiBox(block2, ARTICLE)).toHaveValue(doi2);
            await expect(dois.versionDoiBadge(block2, ARTICLE)).toHaveText(/^\s*Unregistered\s*$/);
            await dois.closeVersionsWindow();
            await expectReaderDoi(reader, tag, axolotl.submissionId, doi2);
            await expectReaderDoi(reader, tag, axolotl.submissionId, doi1, {version: axolotl.publicationId});

            // Marks on two published major versions: "Mark DOIs Registered",
            // "Mark DOIs Needs Sync", then "Mark DOIs Unregistered", each
            // changing every row of 1.0's block and of 2.0's (Rules 20,
            // 26–28, 52).
            for (const [action, notice, status] of [
                ['Mark DOIs Registered', 'Items successfully marked registered', 'Registered'],
                ['Mark DOIs Needs Sync', 'Items successfully marked needs sync', 'Needs Sync'],
                ['Mark DOIs Unregistered', 'Items successfully marked unregistered', 'Unregistered'],
            ]) {
                await dois.goto();
                await dois.runBulk(action, [axolotl.submissionId]);
                await dois.expectNotice(notice);
                await dois.expand(row, axolotl.submissionId);
                await dois.openVersionsWindow(row);
                await expectEveryRow(dois, ['Version of Record 1.0', 'Version of Record 2.0'], status);
                await dois.closeVersionsWindow();
            }

            // A minor version: still "There are 2 versions."; the window holds
            // 1.0's block and 2.1's, "Unpublished", with 2.0's DOI (Rules 12, 20).
            await screen.gotoVersionPage(axolotl.submissionId, majorId, 'titleAbstract', 'Title & Abstract');
            await createVersion(page, tag, 'true');
            await dois.goto();
            await dois.expand(row, axolotl.submissionId);
            await expect(dois.versionsBar(row)).toContainText('There are 2 versions.');
            await dois.openVersionsWindow(row);
            await expect(dois.versionHeadings()).toHaveText([
                /^\s*Version of Record 1\.0 \(.+\)\s*$/,
                /^\s*Version of Record 2\.1 Unpublished\s*$/,
            ]);
            const block21 = dois.versionBlock('Version of Record 2.1');
            await expect(dois.versionDoiBox(block21, ARTICLE)).toHaveValue(doi2);

            // One "Edit" for the window: 2.1's DOI changed; 2.0's page shows
            // it, 1.0's keeps its own (Rules 12, 20, 43).
            await expect(dois.versionsEditButton()).toHaveText(/^\s*Edit\s*$/);
            await dois.versionsEditButton().click();
            await expect(dois.versionsEditButton()).toHaveText(/^\s*Save\s*$/);
            await dois.versionDoiBox(block21, ARTICLE).fill(changed);
            const saved = page.waitForResponse((r) => /\/api\/v1\/dois\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 30_000});
            await dois.versionsEditButton().click();
            expect((await saved).status()).toBe(200);
            await dois.expectNotice('DOI(s) successfully updated');
            await expectReaderDoi(reader, tag, axolotl.submissionId, changed, {version: majorId});
            await expectReaderDoi(reader, tag, axolotl.submissionId, doi1, {version: axolotl.publicationId});
            await reader.context().close();
        } finally {
            await restoreVersioningNo(page, tag);
        }
    });

    test('S13: deposit DOIs with Crossref @solo', async ({browser, baseURL, asUser, ojsApi, pkpMail}, testInfo) => {
        test.setTimeout(360_000);
        // What earlier runs left queued runs (and fails, or goes) now, so the
        // "Failed Jobs" read below compares this test's run alone.
        runJobs();
        const tag = makeTag('s13', testInfo);
        const {manager, ada, mary} = await seedJournal(
            ojsApi,
            tag,
            {
                doiPrefix: PREFIX,
                plugins: {crossrefplugin: {enabled: true, settings: DEPOSITOR}},
                registrationAgency: 'crossrefplugin',
                publisherInstitution: 'Public Knowledge Project',
                onlineIssn: '1234-5679',
            },
            {mary: true}
        );
        const seed = (key, submitter, title, rest) => ojsApi.createSubmission({tag: `${tag}${key}`, context: tag, submitter, title, ...rest});
        const axolotl = await seed('ax', ada, AXOLOTL, {published: true});
        const tardigrade = await seed('ta', mary, TARDIGRADE, {published: true});
        const coral = await seed('co', mary, CORAL, {published: true});
        const moss = await seed('mo', ada, MOSS, {decisions: TO_PRODUCTION});
        const page = await pageAs(asUser, manager);
        const dois = new DoisPage(page, tag);
        const axRow = dois.row(axolotl.submissionId);
        const taRow = dois.row(tardigrade.submissionId);
        const coRow = dois.row(coral.submissionId);
        const moRow = dois.row(moss.submissionId);

        // What the page offers (Rules 24, 36).
        await dois.goto();
        await expect(dois.depositAllButton()).toBeVisible();
        expect(await dois.bulkLabels()).toEqual([
            'Select All',
            'Expand all',
            'Export DOIs',
            'Mark DOIs Registered',
            'Mark DOIs Unregistered',
            'Mark DOIs Needs Sync',
            'Assign DOIs',
            'Deposit DOIs',
        ]);
        await dois.closeBulkActions();
        for (const r of [axRow, taRow, coRow]) await expect(dois.rowBadge(r)).toHaveText('Unregistered');

        // The agency panel (Rule 30).
        await dois.expand(moRow, moss.submissionId);
        await expect(dois.agencyName(moRow)).toHaveText('Crossref');
        await expect(dois.agencySentence(moRow)).toHaveText(TEXT.notPublished);
        await expect(dois.agencyButtons(moRow)).toHaveCount(0);
        await dois.expand(axRow, axolotl.submissionId);
        await expect(dois.agencyName(axRow)).toHaveText('Crossref');
        await expect(dois.agencySentence(axRow)).toHaveText(TEXT.notSubmitted('Crossref'));
        await expect(dois.agencyButtons(axRow)).toHaveText(['Deposit DOI(s)']);

        // Registered by hand: "manually registered", no button (Rule 30).
        await dois.runBulk('Mark DOIs Registered', [tardigrade.submissionId]);
        await expect(dois.rowBadge(taRow)).toHaveText('Registered');
        await dois.expand(taRow, tardigrade.submissionId);
        await expect(dois.agencySentence(taRow)).toHaveText(TEXT.manuallyRegistered);
        await expect(dois.agencyButtons(taRow)).toHaveCount(0);

        // "Export DOIs" with an unpublished work: the question; the "Error"
        // window with the server's reason; nothing downloads (Rule 29).
        /** @type {string[]} */
        const downloads = [];
        page.on('download', (d) => downloads.push(d.suggestedFilename()));
        await dois.tick([axolotl.submissionId, moss.submissionId]);
        const exporting = await dois.chooseBulkAction('Export DOIs');
        await expect(exporting).toContainText(TEXT.exportQuestion(2, 'Crossref'));
        const exported = await dois.confirmAction(exporting, 'Export DOIs');
        expect(exported.status(), 'the export is refused').toBe(400);
        expect(exported.headers()['content-disposition'] || '').not.toContain('attachment');
        await expect(dois.errorDialog()).toContainText(TEXT.invalidObjects);
        await dois.closeErrorDialog();
        expect(downloads).toEqual([]);

        // "Deposit DOIs" with an unpublished work: the question; the "Error"
        // window with the server's reason; nothing marked (Rule 29).
        await dois.tick([axolotl.submissionId, moss.submissionId]);
        const depositing = await dois.chooseBulkAction('Deposit DOIs');
        await expect(depositing).toContainText(TEXT.depositQuestion(2, 'Crossref'));
        const refused = await dois.confirmAction(depositing, 'Deposit DOIs');
        expect(refused.status(), 'the deposit is refused').toBe(400);
        await expect(dois.errorDialog()).toContainText(TEXT.invalidObjects);
        await dois.closeErrorDialog();
        await expect(dois.rowBadge(axRow)).toHaveText('Unregistered');
        await expect(dois.rowBadge(moRow)).toHaveText('Unpublished');

        // "Deposit DOIs": "Submitted" at once, "Edit" greyed (Rules 19, 29,
        // 32; A4 not asserted).
        const deposited = await dois.runBulk('Deposit DOIs', [axolotl.submissionId]);
        expect(deposited.status()).toBe(200);
        await dois.expectNotice(TEXT.depositQueued);
        await expect(dois.rowBadge(axRow)).toHaveText('Submitted');
        await dois.expand(axRow, axolotl.submissionId);
        await expect(dois.doiBadge(axRow, ARTICLE)).toHaveText('Submitted');
        await expect(dois.editButton(axRow)).toBeDisabled();

        // "Deposit All" (Rule 29).
        await expect(dois.rowBadge(coRow)).toHaveText('Unregistered');
        await dois.depositAllButton().click();
        const all = dois.dialog(TEXT.depositAllTitle);
        await expect(all).toBeVisible();
        await expect(all).toContainText(TEXT.depositAllQuestion('Crossref'));
        await expect(all.getByRole('button', {name: TEXT.depositAllTitle, exact: true})).toBeVisible();
        await expect(all.getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        const depositedAll = await dois.confirmAction(all, TEXT.depositAllTitle);
        expect(depositedAll.status()).toBe(200);
        await dois.expectNotice(TEXT.depositQueued);
        await expect(dois.rowBadge(coRow)).toHaveText('Submitted');

        // Control: "Registered" and "Unpublished" untouched (Rules 16, 29a).
        await expect(dois.rowBadge(taRow)).toHaveText('Registered');
        await expect(dois.rowBadge(moRow)).toHaveText('Unpublished');

        // No mail about the deposits (Side effects), bounded by the control.
        await expectNoMailBesidesControl(browser, baseURL, pkpMail, tag, manager, [ada, mary]);

        // The background deposits run: the Site Administrator's "Failed
        // Jobs" noted, then the site's jobs run (Rule 33).
        const adminPage = await (await asUser('admin')).newPage();
        const failed = new FailedJobsPage(adminPage);
        await failed.goto();
        const failedBefore = await failedJobIds(failed);
        runJobs();

        // "Error" after the run: both deposited works and their "Article"
        // rows, each row with "View Error" (Rules 17, 31, 33); the Crossref
        // box with "Deposit DOI(s)" and "View Error" (Rule 30); the row's
        // and the box's "View Error" open the same window over the
        // connection error (Rule 33).
        await dois.reload();
        await expect(dois.rowBadge(axRow)).toHaveText('Error');
        await expect(dois.rowBadge(coRow)).toHaveText('Error');
        await dois.expand(coRow, coral.submissionId);
        await expect(dois.doiBadge(coRow, ARTICLE)).toHaveText('Error');
        await expect(dois.rowViewError(coRow, ARTICLE)).toBeVisible();
        await dois.expand(axRow, axolotl.submissionId);
        await expect(dois.doiBadge(axRow, ARTICLE)).toHaveText('Error');
        await expect(dois.rowViewError(axRow, ARTICLE)).toBeVisible();
        await expect(dois.agencyName(axRow)).toHaveText('Crossref');
        await expect(dois.agencySentence(axRow)).toHaveText(TEXT.notSubmitted('Crossref'));
        await expect(dois.agencyButtons(axRow)).toHaveText(['Deposit DOI(s)', TEXT.viewError]);
        let window = await dois.openErrorMessage(dois.rowViewError(axRow, ARTICLE));
        await expect(window).toContainText(TEXT.depositFailed('Crossref'));
        await expect(window).toContainText(CROSSREF_CURL);
        const message = (await window.innerText()).replace(/\s+/g, ' ').trim();
        await dois.closeErrorMessage();
        window = await dois.openErrorMessage(dois.agencyViewError(axRow));
        await expect(window).toContainText(TEXT.depositFailed('Crossref'));
        await expect(window).toContainText(CROSSREF_CURL);
        expect((await window.innerText()).replace(/\s+/g, ' ').trim(), 'the box\'s window is the row\'s').toBe(message);
        await dois.closeErrorMessage();

        // "Has Error": the two deposited works and no other; pressed again,
        // the list holds all four (Rules 22, 33).
        await dois.pressFilter(TEXT.hasErrorFilter);
        await expectListedExactly(dois, [AXOLOTL, CORAL]);
        await dois.pressFilter(TEXT.hasErrorFilter);
        await expectListedExactly(dois, [AXOLOTL, TARDIGRADE, CORAL, MOSS]);

        // The Site Administrator's "Failed Jobs": no job it did not list
        // before the run (Rule 33).
        await failed.reload();
        const failedAfter = await failedJobIds(failed);
        expect(failedAfter.filter((id) => !failedBefore.includes(id)), 'failed jobs added by the run').toEqual([]);
        await adminPage.close();
    });

    test('S15: Crossmark and "Update Policy DOI"', async ({browser, baseURL, asUser, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s15', testInfo);
        const {manager, ada} = await seedJournal(ojsApi, tag, {
            doiPrefix: PREFIX,
            doiVersioning: false,
            plugins: {crossrefplugin: {enabled: true, settings: DEPOSITOR}},
            registrationAgency: 'crossrefplugin',
        });
        const page = await pageAs(asUser, manager);
        try {
            const axolotl = await ojsApi.createSubmission({tag: `${tag}ax`, context: tag, submitter: ada, title: AXOLOTL, published: true});
            const settings = new DoiSettings(page, tag);
            const reader = await readerPage(browser, baseURL);
            const landing = new ArticleLandingPage(reader, tag);
            const policy = settings.field('updatePolicyDoi');
            const expectButton = async (shown) => {
                await landing.goto(axolotl.submissionId);
                await expect(readerDoiItem(reader)).toBeVisible();
                if (shown) {
                    await expect(landing.sideColumn().locator(':scope > *').last()).toHaveClass(/\bcrossmark\b/);
                    await expect(crossmarkBlock(reader).getByRole('img', {name: 'Crossmark'})).toBeVisible({timeout: 30_000});
                } else {
                    await expect(crossmarkBlock(reader)).toHaveCount(0);
                }
            };

            // Control: before "Crossmark" is saved ticked, no button (Rule 42).
            await expectButton(false);

            // As it arrives: "Crossmark" unticked, no "Update Policy DOI"
            // (Fields; Rule 38).
            await settings.goto('Registration');
            await expect(settings.field('depositorName')).toHaveValue(DEPOSITOR.depositorName);
            await expect(settings.crossmarkBox()).not.toBeChecked();
            await expect(settings.crossmarkBox()).toHaveAccessibleName(CROSSMARK_SENTENCE);
            await expect(policy).toHaveCount(0);

            // Versioning "Yes": "Update Policy DOI" shows, starred; "No": hidden
            // again (Rule 38).
            await settings.openSideTab('Setup');
            await settings.versioningRadio('Yes').check();
            await expect(settings.versioningRadio('Yes')).toHaveAccessibleName(VERSIONING_YES);
            await settings.save(settings.setup);
            await settings.goto('Registration');
            await expect(policy).toBeVisible();
            await expect(policy).toHaveJSProperty('required', true);
            await expect(settings.crossmarkBox()).not.toBeChecked();
            await settings.openSideTab('Setup');
            await settings.versioningRadio('No').check();
            await expect(settings.versioningRadio('No')).toHaveAccessibleName(VERSIONING_NO);
            await settings.save(settings.setup);
            await settings.goto('Registration');
            await expect(settings.crossmarkBox()).toBeVisible();
            await expect(policy).toHaveCount(0);

            // Crossmark ticked: "Update Policy DOI", starred; "policy" refused,
            // "10.1234/policy" saved (Fields; Rule 38).
            await settings.crossmarkBox().check();
            await expect(policy).toBeVisible();
            await expect(policy).toHaveJSProperty('required', true);
            await policy.fill('policy');
            await settings.saveRefused(settings.registration, policy, 'This is not formatted correctly.');
            await policy.fill(`${PREFIX}/policy`);
            await settings.save(settings.registration);

            // The article's page: the Crossmark button, last in the side column
            // (Rule 42).
            await expectButton(true);

            // "None" saved: the button stays (Rule 42).
            await settings.goto('Registration');
            await settings.chooseAgency('None');
            await settings.save(settings.registration);
            await expectButton(true);

            // The plugin disabled: the button gone (Rule 42).
            await settings.gotoPlugins('crossrefplugin');
            await settings.setPluginEnabled('crossrefplugin', false);
            await expectButton(false);
            await reader.context().close();
        } finally {
            await restoreVersioningNo(page, tag);
        }
    });
    test('S16: DataCite @solo', async ({asUser, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s16', testInfo);
        const {manager, ada, mary} = await seedJournal(ojsApi, tag, {doiPrefix: PREFIX, plugins: {dataciteplugin: {enabled: true}}}, {mary: true});
        const seed = (key, submitter, title, rest) => ojsApi.createSubmission({tag: `${tag}${key}`, context: tag, submitter, title, ...rest});
        const axolotl = await seed('ax', ada, AXOLOTL, {published: true});
        const tardigrade = await seed('ta', mary, TARDIGRADE, {published: true, galleys: [{label: 'PDF', file: 'article.pdf'}]});
        const page = await pageAs(asUser, manager);
        const dois = new DoisPage(page, tag);
        const settings = new DoiSettings(page, tag);
        const row = dois.row(axolotl.submissionId);
        const taRow = dois.row(tardigrade.submissionId);

        // Control: before DataCite is saved, no "Deposit All" (Rule 36).
        await dois.goto();
        await expect(dois.bulkActionsButton()).toBeVisible();
        await expect(dois.depositAllButton()).toHaveCount(0);

        // DataCite chosen: its block (Fields, the DataCite block).
        await settings.goto('Registration');
        expect((await settings.agencyState()).value).toBe('');
        await settings.chooseAgency('DataCite');
        await expect(settings.registrationText('DataCite Settings')).toBeVisible();
        await expect(settings.registration).toContainText(TEXT.dataciteIntro);
        for (const name of ['username', 'password', 'testUsername', 'testPassword', 'testDOIPrefix']) {
            await expect(settings.field(name), name).toBeVisible();
        }
        await expect(settings.testingBox('Use the DataCite test system')).toBeVisible();

        // "Testing" without a test prefix refused; then saved (Fields; A5).
        await settings.testingBox('Use the DataCite test system').check();
        await settings.saveRefused(settings.registration, settings.field('testDOIPrefix'), TEXT.testDoiPrefixRequired);
        await settings.field('testDOIPrefix').fill('10.5072');
        await settings.save(settings.registration);

        // The "Setup" tab: DataCite's kinds, no "Peer Review" (Rule 35).
        await settings.goto('Setup');
        expect((await settings.kinds()).map((k) => k.label)).toEqual(DATACITE_KINDS);
        await expect(settings.kindBox('Peer Review')).toHaveCount(0);

        // The DOIs page: "Deposit All", the agency's actions and panel
        // (Rules 30, 36).
        await dois.goto();
        await expect(dois.depositAllButton()).toBeVisible();
        await dois.openBulkActions();
        await expect(dois.bulkItem('Export DOIs')).toBeVisible();
        await expect(dois.bulkItem('Deposit DOIs')).toBeVisible();
        await dois.closeBulkActions();
        await dois.expand(row, axolotl.submissionId);
        await expect(dois.agencyName(row)).toHaveText('DataCite');
        await expect(dois.agencySentence(row)).toHaveText(TEXT.notSubmitted('DataCite'));
        await expect(dois.agencyButtons(row)).toHaveText(['Deposit DOI(s)']);

        // "Deposit DOI(s)": the window for this item; "Submitted" (Rules 29, 30).
        await dois.agencyButtons(row).click();
        const deposit = dois.dialog('Deposit DOIs');
        await expect(deposit).toBeVisible();
        await expect(deposit).toContainText(TEXT.depositQuestion(1, 'DataCite'));
        const deposited = await dois.confirmAction(deposit, 'Deposit DOIs');
        expect(deposited.status()).toBe(200);
        await dois.expectNotice(TEXT.depositQueued);
        await dois.expand(row, axolotl.submissionId);
        await expect(dois.doiBadge(row, ARTICLE)).toHaveText('Submitted');

        // The background deposit run, by the job tool: the "Article" row
        // "Error" with "View Error", the DataCite box with "Deposit DOI(s)"
        // and "View Error" (Rules 17, 30, 33, 33a); the row's and the box's
        // "View Error" open the same window over the connection error to
        // DataCite's test system ("Testing" is ticked; Rule 33).
        runJobs();
        await dois.reload();
        await dois.expand(row, axolotl.submissionId);
        await expect(dois.doiBadge(row, ARTICLE)).toHaveText('Error');
        await expect(dois.rowViewError(row, ARTICLE)).toBeVisible();
        await expect(dois.agencyName(row)).toHaveText('DataCite');
        await expect(dois.agencySentence(row)).toHaveText(TEXT.notSubmitted('DataCite'));
        await expect(dois.agencyButtons(row)).toHaveText(['Deposit DOI(s)', TEXT.viewError]);
        let window = await dois.openErrorMessage(dois.rowViewError(row, ARTICLE));
        await expect(window).toContainText(TEXT.depositFailed('DataCite'));
        await expect(window).toContainText(DATACITE_TEST_CURL);
        const message = (await window.innerText()).replace(/\s+/g, ' ').trim();
        await dois.closeErrorMessage();
        window = await dois.openErrorMessage(dois.agencyViewError(row));
        await expect(window).toContainText(TEXT.depositFailed('DataCite'));
        await expect(window).toContainText(DATACITE_TEST_CURL);
        expect((await window.innerText()).replace(/\s+/g, ' ').trim(), 'the box\'s window is the row\'s').toBe(message);
        await dois.closeErrorMessage();

        // An article registered before galley DOIs: "Mark DOIs Registered"
        // (Rule 26); the galley box ticked and saved, "Assign DOIs" gives
        // the "PDF" row a DOI, "Unregistered" (Rules 4, 25).
        await dois.runBulk('Mark DOIs Registered', [tardigrade.submissionId]);
        await dois.expectNotice(TEXT.markedRegistered);
        await dois.expand(taRow, tardigrade.submissionId);
        expect(await dois.doiTypes(taRow)).toEqual([ARTICLE]);
        await expect(dois.doiBadge(taRow, ARTICLE)).toHaveText('Registered');
        await settings.goto('Setup');
        await settings.kindBox(GALLEYS).check();
        await settings.save(settings.setup);
        await dois.goto();
        await dois.runBulk('Assign DOIs', [tardigrade.submissionId]);
        await dois.expectNotice(TEXT.assigned);
        await dois.expand(taRow, tardigrade.submissionId);
        expect(await dois.doiTypes(taRow)).toEqual([ARTICLE, 'PDF']);
        await expect(dois.doiBox(taRow, 'PDF')).toHaveValue(MADE);
        await expect(dois.doiBadge(taRow, 'PDF')).toHaveText('Unregistered');
        await expect(dois.doiBadge(taRow, ARTICLE)).toHaveText('Registered');

        // "Deposit All" takes the galley's DOI: the "PDF" row "Submitted",
        // the "Article" row keeps "Registered" (Rule 29a).
        await depositAll(dois);
        await dois.expand(taRow, tardigrade.submissionId);
        await expect(dois.doiBadge(taRow, 'PDF')).toHaveText('Submitted');
        await expect(dois.doiBadge(taRow, ARTICLE)).toHaveText('Registered');

        // Galleys without "Articles": "Mark DOIs Unregistered" turns the
        // "PDF" row "Unregistered"; "Deposit All" turns it "Submitted"
        // (Rules 27, 29a).
        await settings.goto('Setup');
        await settings.kindBox('Articles').uncheck();
        await settings.save(settings.setup);
        await dois.goto();
        await dois.runBulk('Mark DOIs Unregistered', [tardigrade.submissionId]);
        await dois.expectNotice(TEXT.markedUnregistered);
        await dois.expand(taRow, tardigrade.submissionId);
        await expect(dois.doiBadge(taRow, 'PDF')).toHaveText('Unregistered');
        await depositAll(dois);
        await dois.expand(taRow, tardigrade.submissionId);
        await expect(dois.doiBadge(taRow, 'PDF')).toHaveText('Submitted');
    });

    test('S22: deposits under "DOI Versioning" "Yes" @solo', async ({asUser, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s22', testInfo);
        const {manager, ada} = await seedJournal(ojsApi, tag, {
            doiPrefix: PREFIX,
            doiVersioning: true,
            plugins: {crossrefplugin: {enabled: true, settings: DEPOSITOR}},
            registrationAgency: 'crossrefplugin',
            publisherInstitution: 'Public Knowledge Project',
            onlineIssn: '1234-5679',
        });
        const page = await pageAs(asUser, manager);
        try {
            const seed = (key, title) => ojsApi.createSubmission({tag: `${tag}${key}`, context: tag, submitter: ada, title, published: true});
            const axolotl = await seed('ax', AXOLOTL);
            const tardigrade = await seed('ta', TARDIGRADE);
            const coral = await seed('co', CORAL);
            const dois = new DoisPage(page, tag);
            const screen = new PublicationScreen(page, tag);
            const axRow = dois.row(axolotl.submissionId);
            const taRow = dois.row(tardigrade.submissionId);
            const coRow = dois.row(coral.submissionId);
            const v1 = 'Version of Record 1.0';
            const v2 = 'Version of Record 2.0';
            const badge = (heading) => dois.versionDoiBadge(dois.versionBlock(heading), ARTICLE);
            const box = (heading) => dois.versionDoiBox(dois.versionBlock(heading), ARTICLE);
            const openWindow = async (row, id) => {
                await dois.goto();
                await dois.expand(row, id);
                await dois.openVersionsWindow(row);
            };

            // A major version not yet published: "View all" holds 1.0's block
            // and 2.0's, "Unpublished", each "Article" row a DOI of its own,
            // "Unregistered" (Rules 5, 12, 20).
            await screen.gotoVersionPage(axolotl.submissionId, axolotl.publicationId, 'titleAbstract', 'Title & Abstract');
            const axMajor = await createVersion(page, tag, 'false');
            await openWindow(axRow, axolotl.submissionId);
            await expect(dois.versionHeadings()).toHaveText([
                /^\s*Version of Record 1\.0 \(.+\)\s*$/,
                /^\s*Version of Record 2\.0 Unpublished\s*$/,
            ]);
            await expect(box(v1)).toHaveValue(MADE);
            await expect(box(v2)).toHaveValue(MADE);
            expect(await box(v2).inputValue()).not.toBe(await box(v1).inputValue());
            await expect(badge(v1)).toHaveText(/^\s*Unregistered\s*$/);
            await expect(badge(v2)).toHaveText(/^\s*Unregistered\s*$/);
            await dois.closeVersionsWindow();

            // "Deposit DOIs" with the new version unpublished: 1.0 "Submitted",
            // 2.0 keeps "Unregistered" (Rule 29).
            const deposited = await dois.runBulk('Deposit DOIs', [axolotl.submissionId]);
            expect(deposited.status()).toBe(200);
            await dois.expectNotice('Items successfully submitted for deposit');
            await dois.expand(axRow, axolotl.submissionId);
            await dois.openVersionsWindow(axRow);
            await expect(badge(v1)).toHaveText(/^\s*Submitted\s*$/);
            await expect(badge(v2)).toHaveText(/^\s*Unregistered\s*$/);
            await dois.closeVersionsWindow();

            // Two published major versions: 2.0's block a DOI of its own,
            // "Unregistered" (Rules 12, 32).
            await screen.gotoVersionPage(tardigrade.submissionId, tardigrade.publicationId, 'titleAbstract', 'Title & Abstract');
            const taMajor = await createVersion(page, tag, 'false');
            await screen.gotoVersionPage(tardigrade.submissionId, taMajor, 'titleAbstract', 'Title & Abstract');
            await publishOpenVersion(page, tag);
            await openWindow(taRow, tardigrade.submissionId);
            await expect(dois.versionHeadings()).toHaveText([
                /^\s*Version of Record 1\.0 \(.+\)\s*$/,
                /^\s*Version of Record 2\.0 \(.+\)\s*$/,
            ]);
            await expect(box(v2)).toHaveValue(MADE);
            expect(await box(v2).inputValue()).not.toBe(await box(v1).inputValue());
            await expect(badge(v2)).toHaveText(/^\s*Unregistered\s*$/);
            await dois.closeVersionsWindow();

            // A published minor version: no "There are … versions." line and no
            // "View all", the expanded view's DOI table on screen (Rule 20).
            await screen.gotoVersionPage(coral.submissionId, coral.publicationId, 'titleAbstract', 'Title & Abstract');
            const coMinor = await createVersion(page, tag, 'true');
            await screen.gotoVersionPage(coral.submissionId, coMinor, 'titleAbstract', 'Title & Abstract');
            await publishOpenVersion(page, tag);
            await dois.goto();
            await dois.expand(coRow, coral.submissionId);
            await expect(dois.versionName(coRow)).toHaveText(/^\s*Version of Record 1\.1\s*$/);
            await expect(dois.doiBox(coRow, ARTICLE)).toHaveValue(MADE);
            const coDoi = await dois.doiBox(coRow, ARTICLE).inputValue();
            await expect(dois.versionsBar(coRow)).toHaveCount(0);
            await expect(dois.viewAllButton(coRow)).toHaveCount(0);

            // Control: right after its publication, before "Deposit All",
            // "Axolotl limb memory"'s 2.0 row still reads "Unregistered"
            // (Rule 26).
            await screen.gotoVersionPage(axolotl.submissionId, axMajor, 'titleAbstract', 'Title & Abstract');
            await publishOpenVersion(page, tag);
            await openWindow(axRow, axolotl.submissionId);
            await expect(badge(v2)).toHaveText(/^\s*Unregistered\s*$/);
            await dois.closeVersionsWindow();

            // "Deposit All" after the publications: "Axolotl limb memory"'s
            // 2.0 "Submitted"; both of "Tardigrade desiccation"'s blocks
            // "Submitted"; "Coral spawning"'s shared DOI "Submitted" (Rule 29a).
            await dois.depositAllButton().click();
            const all = dois.dialog('Deposit all DOIs');
            await expect(all).toBeVisible();
            expect((await dois.confirmAction(all, 'Deposit all DOIs')).status()).toBe(200);
            await dois.expectNotice('Items successfully submitted for deposit');
            await dois.expand(axRow, axolotl.submissionId);
            await dois.openVersionsWindow(axRow);
            await expect(badge(v2)).toHaveText(/^\s*Submitted\s*$/);
            await dois.closeVersionsWindow();
            await dois.expand(taRow, tardigrade.submissionId);
            await dois.openVersionsWindow(taRow);
            await expect(badge(v1)).toHaveText(/^\s*Submitted\s*$/);
            await expect(badge(v2)).toHaveText(/^\s*Submitted\s*$/);
            await dois.closeVersionsWindow();
            await dois.expand(coRow, coral.submissionId);
            await expect(dois.doiBox(coRow, ARTICLE)).toHaveValue(coDoi);
            await expect(dois.doiBadge(coRow, ARTICLE)).toHaveText('Submitted');
        } finally {
            await restoreVersioningNo(page, tag);
        }
    });
});
