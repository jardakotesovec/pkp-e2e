// @ts-check
/**
 * @file playwright/tests/serial/U45-dois.spec.js
 *
 * DOIs — the OPS scenario that cannot run beside the parallel suite: S13
 * runs the site's background jobs after its deposits with `runJobs()` and
 * reads "Error" after it (Rule 33, footnote sc), which only the serial
 * project may do (patterns.md parallel lesson 7). Its deposits are first
 * read "Submitted", before any run, and another serial test's drain would
 * turn them "Error" under the read; its "Failed Jobs" lists every job of
 * the fleet. So it carries `@solo` and runs alone in `ops-solo`, and it
 * runs the jobs once before seeding, so what an earlier run left queued
 * has failed or gone before the list is noted.
 * Spec: docs/specs/U45-dois.md
 *
 * Coverage boundaries are declared in the parallel suite's header
 * (playwright/tests/U45-dois.spec.js).
 *
 * Seeding: scenario endpoints only, a scratch preprint server with a
 * throwaway Preprint Server Manager and the Authors "Ada Lovelace" and
 * "Mary Anning" (footnote sc): `doiPrefix`, the Crossref plugin with its
 * depositor fields and `registrationAgency`; three preprints seeded
 * `published`, "Moss regrowth" submitted and waiting in Production,
 * unposted. The Site Administrator is the installer's `admin`. The mail
 * catcher's silence is bounded by a password-reset message sent to the
 * server's own manager after the deposits (A8).
 */
const {test, expect} = require('../../support/fixtures.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');
const {FailedJobsPage} = require('../../../../../shared/playwright/pages/AdminPages.js');
const {DOIS_TEXT: TEXT, DoisPage, recordNotices} = require('../../../../../shared/playwright/pages/DoisPages.js');

const PREFIX = '10.1234';
const PREPRINT = 'Preprint';
const AXOLOTL = 'Axolotl limb memory';
const TARDIGRADE = 'Tardigrade desiccation';
const CORAL = 'Coral spawning';
const MOSS = 'Moss regrowth';
const DEPOSITOR = {depositorName: 'Public Knowledge Project', depositorEmail: 'doi@mail.test'};

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u45${scenario}opw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: mailOf(username), roles};
}

/**
 * Seed a scratch preprint server with a throwaway Preprint Server Manager
 * ("Mona Manager") and the Authors "Ada Lovelace" and "Mary Anning"; the
 * other keys go to the context scenario as given.
 */
async function seedServer(opsApi, tag, keys = {}) {
    const users = [
        user(`${tag}mg`, 'Mona', 'Manager', ['manager']),
        user(`${tag}al`, 'Ada', 'Lovelace', ['author']),
        user(`${tag}ma`, 'Mary', 'Anning', ['author']),
    ];
    await opsApi.createContext({tag, users, ...keys});
    return {manager: `${tag}mg`, ada: `${tag}al`, mary: `${tag}ma`};
}

/** Seed a preprint on the scratch server `tag`. */
async function seedPreprint(opsApi, tag, key, submitter, title, rest = {}) {
    return opsApi.createSubmission({tag: `${tag}${key}`, context: tag, submitter, title, ...rest});
}

/** A page as `username`, every browser dialog accepted, the notices recorded. */
async function pageAs(asUser, username) {
    const page = await (await asUser(username)).newPage();
    page.on('dialog', (dialog) => {
        dialog.accept().catch(() => {});
    });
    await recordNotices(page);
    return page;
}

/** A signed-out visitor page (an explicit empty state, patterns.md lesson 8). */
async function readerPage(browser, baseURL) {
    const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
    return context.newPage();
}

/**
 * The mail catcher's silence for `others`, bounded by a positive control:
 * a password reset for the server's own manager, asked on the server's
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
 * The list shown holds exactly the preprints titled `titles`, read settled
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
    test('S13: deposit DOIs with Crossref @solo', async ({browser, baseURL, asUser, opsApi, pkpMail}, testInfo) => {
        test.setTimeout(360_000);
        // What earlier runs left queued runs (and fails, or goes) now, so the
        // "Failed Jobs" read below compares this test's run alone.
        runJobs();
        const tag = makeTag('s13', testInfo);
        const {manager, ada, mary} = await seedServer(opsApi, tag, {
            doiPrefix: PREFIX,
            plugins: {crossrefplugin: {enabled: true, settings: DEPOSITOR}},
            registrationAgency: 'crossrefplugin',
        });
        const axolotl = await seedPreprint(opsApi, tag, 'ax', ada, AXOLOTL, {published: true});
        const tardigrade = await seedPreprint(opsApi, tag, 'ta', mary, TARDIGRADE, {published: true});
        const coral = await seedPreprint(opsApi, tag, 'co', mary, CORAL, {published: true});
        const moss = await seedPreprint(opsApi, tag, 'mo', ada, MOSS);
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

        // "Export DOIs" with an unposted preprint: the question; the "Error"
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

        // "Deposit DOIs" with an unposted preprint: the question; the "Error"
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
        await expect(dois.doiBadge(axRow, PREPRINT)).toHaveText('Submitted');
        await expect(dois.editButton(axRow)).toBeDisabled();

        // "Deposit All" (Rules 29, 29a).
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

        // "Error" after the run: both deposited preprints and their
        // "Preprint" rows, each row with "View Error" (Rules 17, 31, 33);
        // the Crossref box's sentence (Rule 30); the row's "View Error"
        // opens "Registration Error Message" with Crossref's preamble (Rule
        // 33). The box's own "View Error" and the connection error under
        // the preamble are not asserted: a deposit run by the job tool
        // stores no message on a preprint server (Rule 33a, ⚠ A31).
        await dois.reload();
        await expect(dois.rowBadge(axRow)).toHaveText('Error');
        await expect(dois.rowBadge(coRow)).toHaveText('Error');
        await dois.expand(coRow, coral.submissionId);
        await expect(dois.doiBadge(coRow, PREPRINT)).toHaveText('Error');
        await expect(dois.rowViewError(coRow, PREPRINT)).toBeVisible();
        await dois.expand(axRow, axolotl.submissionId);
        await expect(dois.doiBadge(axRow, PREPRINT)).toHaveText('Error');
        await expect(dois.rowViewError(axRow, PREPRINT)).toBeVisible();
        await expect(dois.agencyName(axRow)).toHaveText('Crossref');
        await expect(dois.agencySentence(axRow)).toHaveText(TEXT.notSubmitted('Crossref'));
        await expect(dois.agencyButtons(axRow).filter({hasText: 'Deposit DOI(s)'})).toHaveCount(1);
        const window = await dois.openErrorMessage(dois.rowViewError(axRow, PREPRINT));
        await expect(window).toContainText(TEXT.depositFailed('Crossref'));
        await dois.closeErrorMessage();

        // "Has Error": the two deposited preprints and no other; pressed
        // again, the list holds all four (Rules 22, 33).
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
});
