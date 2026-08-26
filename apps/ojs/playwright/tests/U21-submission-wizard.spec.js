// @ts-check
/**
 * @file playwright/tests/U21-submission-wizard.spec.js
 *
 * Submission wizard — OJS suite, one test per canonical scenario the spec
 * runs on OJS (common scenarios 1–11 + the OJS-specific 12–13; scenario 14
 * is OMP-only, 15 OPS-only).
 * Spec: docs/specs/U21-submission-wizard.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - A1 ❓ is left open: S8 asserts the spec's canonical scenario 8 (a draft
 *   started before submissions closed can still be filled and submitted);
 *   whether the closure SHOULD block drafts is the register's question.
 * - A2 ❓: only the ordinary save-for-later case is asserted (the presser IS
 *   the submitting author, S3); the manager-presses-save variant and where
 *   its email goes are not asserted.
 * - A3 ❓: S7 asserts only the notice's first sentence ("This journal is not
 *   accepting submissions at this time.") — the manager-facing tail is the
 *   register's open question and is not frozen here.
 * - A4 🐞: the footer's "Last saved" counter is never asserted.
 * - A5 🐞 / copyright confirmation: neither publicknowledge nor scratch
 *   journals carry a copyright notice, so the Review step's Confirmation box
 *   (Rules 12/14) and the copyright activity-log entry stay unexercised.
 * - A6 🐞: double-submitting from a second tab is not exercised.
 * - A7 🐞: S2 asserts the acknowledgement email under the default
 *   all-authors setting only; the acknowledgements-off completion screen's
 *   wording is not asserted.
 * - A8 🐞: S11 asserts editor auto-assignment on the seeded first journal
 *   (where it works) and the needs-editor path on a scratch-journal section
 *   with NO configured editor; a configured-but-never-assigned editor on a
 *   newer journal is the register finding and is not asserted as contract.
 * - Rule 8's hash-editing, Rule 9's autosave timer / offline / restore
 *   dialog, Rule 1's reader-site block, and Rule 6's bookmark semantics
 *   beyond S3's resume are not canonical scenarios of this spec.
 * - "On Cancel … nothing is emailed" (Side effects): a mail-silence claim
 *   with no natural in-test positive control; not asserted.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only (journal-level mutations run on scratch journals with
 * throwaway users). This suite added three builder passthroughs — submission
 * `participants[]`, context `sections[]`, and
 * `context.supportedSubmissionLocales` — each recorded for the parity
 * ledger. Mailpit assertions are scoped by unique throwaway recipients
 * (PRINCIPLES A8). Waits are event-based (the Review check is awaited on its
 * own `_validateOnly` response; step changes flush autosaves at the source)
 * — no hard-coded sleeps. Everything runs in the parallel `ojs` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    StartSubmissionPage,
    SubmissionWizardPage,
    FIXTURE_PDF_NAME,
} = require('../pages/SubmissionWizardPage.js');
const {WorkflowPage} = require('../pages/ReviewStagePages.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

const JOURNAL = 'publicknowledge';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u21${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Seed a scratch journal named by the tag, with a throwaway author (always)
 * and optionally a throwaway manager. Usernames/emails carry the tag so
 * Mailpit assertions stay recipient-scoped (A8).
 */
async function seedScratchJournal(ojsApi, tag, {manager = false, context = {}, sections} = {}) {
    const users = [
        {
            username: `${tag}au`,
            givenName: 'Ada',
            familyName: 'Author',
            email: `${tag}au@mail.test`,
            roles: ['author'],
        },
    ];
    if (manager) {
        users.push({
            username: `${tag}mg`,
            givenName: 'Mona',
            familyName: 'Manager',
            email: `${tag}mg@mail.test`,
            roles: ['manager'],
        });
    }
    const spec = {tag, context, users};
    if (sections) {
        spec.sections = sections;
    }
    await ojsApi.createContext(spec);
    return {
        path: tag,
        author: `${tag}au`,
        authorEmail: `${tag}au@mail.test`,
        manager: `${tag}mg`,
        managerEmail: `${tag}mg@mail.test`,
    };
}

/** Seed a wizard-resumable draft. */
async function seedDraft(ojsApi, tag, contextPath, submitter, extra = {}) {
    return await ojsApi.createSubmission({
        tag,
        context: contextPath,
        submitter,
        title: `Submission ${tag}`,
        submitted: false,
        ...extra,
    });
}

/**
 * Walk a seeded scratch-journal draft from Upload Files to a validated
 * Review step (uploads the required Article Text file on the way).
 */
async function walkDraftToReview(wizard, submissionId) {
    await wizard.expectStep('Upload Files');
    await wizard.uploadFile();
    await wizard.continueTo('Details');
    await wizard.continueTo('Contributors');
    await wizard.continueTo('For the Editors');
    await wizard.continueToReview(submissionId);
}

/** The dashboard submissions-table search box (scoped by accessible name). */
function tableSearch(page) {
    return page.getByRole('searchbox', {name: /Search submissions, ID/});
}

/** Find a submission's dashboard row by its unique tag (commits on Enter). */
async function findRowByTag(page, tag) {
    const search = tableSearch(page);
    await expect(search).toBeVisible({timeout: 30_000});
    await search.click();
    await search.pressSequentially(tag, {delay: 25});
    await search.press('Enter');
    const row = page.getByRole('row').filter({hasText: tag});
    await expect(row).toBeVisible({timeout: 30_000});
    return row;
}

/**
 * Tick/untick a checkbox on a Vue settings form and save it, bounded by the
 * context API's save response.
 */
async function saveContextSettingsCheckbox(page, checkboxName, checked) {
    const box = page.getByRole('checkbox', {name: checkboxName});
    await expect(box).toBeVisible({timeout: 30_000});
    if (checked) {
        await box.check();
    } else {
        await box.uncheck();
    }
    const form = page.locator('form').filter({has: page.getByRole('checkbox', {name: checkboxName})});
    const saved = page.waitForResponse(
        (r) => r.url().includes('/api/v1/contexts/') && r.request().method() === 'POST'
    );
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const response = await saved;
    expect(response.ok()).toBeTruthy();
}

/**
 * Open a legacy settings grid row's Edit form (sections grid, roles grid):
 * expand the row's extras, follow the named action link.
 */
async function openGridRowEdit(page, rowText, editLinkName) {
    const row = page.locator('tr.gridRow').filter({hasText: rowText}).first();
    await expect(row).toBeVisible({timeout: 30_000});
    await row.locator('a.show_extras').click();
    await page.getByRole('link', {name: editLinkName, exact: true}).click();
    await waitForJQueryIdle(page);
}

test.describe('submission wizard', () => {
    test('S1: start a submission from the sidebar', {tag: '@smoke'}, async ({asUser}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const page = await (await asUser('author.alex')).newPage();

        // The dashboard sidebar offers "Start A New Submission" (Rule 1).
        await page.goto(`/index.php/${JOURNAL}/dashboard/mySubmissions`);
        await page.getByRole('link', {name: 'Start A New Submission'}).click();

        // The "Make a Submission" start form (Rule 4).
        const start = new StartSubmissionPage(page, JOURNAL);
        await expect(start.heading()).toBeVisible({timeout: 30_000});
        await start.fillTitle(`Submission ${tag}`);
        await start.sectionRadio('Articles').check();
        await start.checklistBox().check();
        await start.privacyBox().check();
        await start.begin();

        // The wizard opens on Upload Files, with the new submission's number
        // shown above the heading (Rule 5, scenario 1).
        const wizard = new SubmissionWizardPage(page, JOURNAL);
        await wizard.expectLoaded();
        await wizard.expectStep('Upload Files');
        const submissionId = new URL(page.url()).searchParams.get('id');
        expect(Number(submissionId)).toBeGreaterThan(0);
        await expect(wizard.submissionDetailsLine()).toContainText(String(submissionId));
    });

    test('S2: fill every step and submit', {tag: '@smoke'}, async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const journal = await seedScratchJournal(ojsApi, tag);
        const {submissionId} = await seedDraft(ojsApi, tag, journal.path, journal.author);

        const page = await (await asUser(journal.author)).newPage();
        const wizard = new SubmissionWizardPage(page, journal.path);
        await wizard.goto(submissionId);

        // Upload a file, pass Details (title and abstract ride in from the
        // seed), confirm yourself on Contributors, pass For the Editors.
        await wizard.expectStep('Upload Files');
        await wizard.uploadFile();
        await wizard.continueTo('Details');
        await wizard.continueTo('Contributors');
        await expect(page.getByText('Ada Author').first()).toBeVisible();
        await wizard.continueTo('For the Editors');

        // Review: the check clears with no problems banner (bounded by the
        // validation response and the rendered panels).
        await wizard.continueToReview(submissionId);
        await expect(wizard.reviewPanel('Files')).toBeVisible();
        await expect(wizard.reviewPanel('Files')).toContainText(FIXTURE_PDF_NAME);
        await expect(wizard.errorBanner()).toHaveCount(0);
        await expect(wizard.submitButton()).toBeEnabled();

        // Submit and confirm the dialog (Rule 14) → "Submission complete"
        // with its three links (Rule 15).
        await wizard.submitAndConfirm();
        await expect(page.getByRole('link', {name: 'Review this submission'})).toBeVisible();
        await expect(page.getByRole('link', {name: 'Create a new submission'})).toBeVisible();
        await expect(page.getByRole('link', {name: 'Return to your dashboard'})).toBeVisible();

        // The acknowledgement email arrives in the mail catcher.
        await pkpMail.find({to: journal.authorEmail, contains: tag});

        // "Review this submission" opens the submission's workflow.
        await page.getByRole('link', {name: 'Review this submission'}).click();
        await expect(page.getByRole('heading', {name: /^Workflow:/})).toBeVisible({timeout: 30_000});
    });

    test('S3: save for later and resume', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const journal = await seedScratchJournal(ojsApi, tag);
        const {submissionId} = await seedDraft(ojsApi, tag, journal.path, journal.author);

        const page = await (await asUser(journal.author)).newPage();
        const wizard = new SubmissionWizardPage(page, journal.path);
        await wizard.goto(submissionId);
        await wizard.continueTo('Details');

        // Save for Later → the Saved for Later screen: a link naming the
        // submission, and the emailed-copy note (Rule 10).
        await wizard.saveForLater();
        await expect(page.getByRole('link', {name: new RegExp(`Submission ${tag}`)})).toBeVisible();
        await expect(
            page.getByText(`We have emailed a copy of this link to you at ${journal.authorEmail}.`)
        ).toBeVisible();

        // The email arrives; its link reopens the wizard on the step left.
        const message = await pkpMail.find({to: journal.authorEmail, contains: tag});
        const full = await pkpMail.fullMessage(message.ID);
        const link = pkpMail.extractLink(full.HTML, new RegExp(tag));
        expect(link).toBeTruthy();
        await page.goto(link);
        await wizard.expectLoaded();
        await wizard.expectStep('Details');
    });

    test('S4: cancel a draft', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const {submissionId} = await seedDraft(ojsApi, tag, JOURNAL, 'author.alex', {
            participants: [{username: 'sectioneditor.ana', role: 'sectionEditor'}],
        });

        // Control: the assigned Section Editor opens the draft's wizard but
        // is offered no "Cancel" (bounded by the footer's other buttons).
        const anaPage = await (await asUser('sectioneditor.ana')).newPage();
        const anaWizard = new SubmissionWizardPage(anaPage, JOURNAL);
        await anaWizard.goto(submissionId);
        await expect(anaWizard.saveForLaterButton()).toBeVisible();
        await expect(anaWizard.continueButton()).toBeVisible();
        await expect(anaWizard.cancelButton()).toHaveCount(0);

        // The draft is on the author's My Submissions list (positive control
        // for its disappearance below).
        const page = await (await asUser('author.alex')).newPage();
        await page.goto(`/index.php/${JOURNAL}/dashboard/mySubmissions`);
        await findRowByTag(page, tag);

        // Cancel through the footer control and its warning dialog (Rule 16).
        const wizard = new SubmissionWizardPage(page, JOURNAL);
        await wizard.goto(submissionId);
        await wizard.cancelAndConfirm();
        await expect(page.getByRole('link', {name: 'Create a new submission'})).toBeVisible();
        await expect(page.getByRole('link', {name: 'Return to your dashboard'})).toBeVisible();

        // The draft is gone from My Submissions (absence bounded by the
        // search's own filtered response).
        await page.goto(`/index.php/${JOURNAL}/dashboard/mySubmissions`);
        const filtered = page.waitForResponse(
            (r) => r.url().includes('_submissions') && r.url().includes(tag)
        );
        const search = tableSearch(page);
        await expect(search).toBeVisible({timeout: 30_000});
        await search.click();
        await search.pressSequentially(tag, {delay: 25});
        await search.press('Enter');
        await filtered;
        await expect(page.getByRole('row').filter({hasText: tag})).toHaveCount(0);
    });

    test('S5: change settings midway', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        // A journal with two open sections and two submission languages.
        const journal = await seedScratchJournal(ojsApi, tag, {
            context: {
                supportedLocales: ['en', 'fr_CA'],
                supportedSubmissionLocales: ['en', 'fr_CA'],
            },
            sections: [
                {abbrev: 'ALP', title: 'Alpha'},
                {abbrev: 'BET', title: 'Beta'},
            ],
        });
        const {submissionId} = await seedDraft(ojsApi, tag, journal.path, journal.author, {
            section: 'ALP',
            locale: 'en',
        });

        const page = await (await asUser(journal.author)).newPage();
        const wizard = new SubmissionWizardPage(page, journal.path);
        await wizard.goto(submissionId);

        // The header names what is being submitted (Rule 7).
        await expect(wizard.submittingToLine()).toContainText('Alpha');
        await expect(wizard.submittingToLine()).toContainText('English');

        // "Change" opens Change Submission Settings; pick the other section
        // and language and save (Rule 11).
        await wizard.changeButton().click();
        // The side-modal wrapper reports visibility:hidden — anchor on inner
        // content (patterns.md locator pitfall 5).
        const modal = wizard.reconfigureModal();
        await expect(modal.getByText('Change Submission Settings')).toBeVisible({timeout: 30_000});
        await modal.getByRole('radio', {name: 'Beta', exact: true}).check();
        await modal.getByRole('radio', {name: /Français|French/}).check();
        await modal.getByRole('button', {name: 'Save', exact: true}).click();

        // The wizard reloads and the line names the new section + language.
        await expect(wizard.submittingToLine()).toContainText('Beta', {timeout: 45_000});
        await expect(wizard.submittingToLine()).toContainText(/Français|French/);
    });

    test('S6: validation blocks an empty submission', async ({asUser}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const page = await (await asUser('author.alex')).newPage();

        // Start a fresh draft through the start form (title only) so it has
        // no file and no abstract.
        const start = new StartSubmissionPage(page, JOURNAL);
        await start.goto();
        await start.fillTitle(`Submission ${tag}`);
        await start.sectionRadio('Articles').check();
        await start.checklistBox().check();
        await start.privacyBox().check();
        await start.begin();

        const wizard = new SubmissionWizardPage(page, JOURNAL);
        await wizard.expectLoaded();
        const submissionId = Number(new URL(page.url()).searchParams.get('id'));

        // Straight to Review on "Continue" alone.
        await wizard.continueTo('Details');
        await wizard.continueTo('Contributors');
        await wizard.continueTo('For the Editors');
        await wizard.continueToReview(submissionId);

        // The problems banner, with the missing items called out on their
        // panels; Submit is disabled (scenario 6, Rules 12–13).
        await expect(wizard.errorBanner()).toBeVisible();
        await expect(wizard.reviewPanel('Files')).toContainText(
            'You must upload at least one Article Text file.'
        );
        await expect(wizard.reviewPanel('Details')).toContainText('This field is required.');
        await expect(wizard.submitButton()).toBeDisabled();

        // Fix one item through its panel's Edit button and return: that
        // complaint is gone (the file complaint stays — the positive control
        // that the re-check ran).
        await wizard.editFromPanel('Details');
        await wizard.expectStep('Details');
        await wizard.fillRichText('titleAbstract-abstract-control-en', `Abstract for ${tag}.`);
        const revalidated = wizard.armValidation(submissionId);
        await wizard.gotoStep('Review');
        await revalidated;
        await expect(wizard.reviewPanel('Files')).toContainText(
            'You must upload at least one Article Text file.'
        );
        await expect(wizard.errorBanner()).toBeVisible();
        await expect(wizard.reviewPanel('Details').getByText('This field is required.')).toHaveCount(0);
    });

    test('S7: the journal stops accepting submissions', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const journal = await seedScratchJournal(ojsApi, tag, {manager: true});

        // Control: while submissions are open the author's sidebar offers
        // the entry and the start screen carries the form.
        const authorPage = await (await asUser(journal.author)).newPage();
        await authorPage.goto(`/index.php/${journal.path}/dashboard/mySubmissions`);
        await expect(authorPage.getByRole('link', {name: 'Start A New Submission'})).toBeVisible();

        // The manager disables submissions in the workflow settings.
        const managerPage = await (await asUser(journal.manager)).newPage();
        await managerPage.goto(`/index.php/${journal.path}/management/settings/workflow`);
        await saveContextSettingsCheckbox(managerPage, 'Disable Submissions', true);

        // The sidebar entry disappears and the typed address shows only the
        // not-accepting notice (Rule 2; only the first sentence is asserted —
        // the notice's tail is register ❓ A3).
        await authorPage.goto(`/index.php/${journal.path}/dashboard/mySubmissions`);
        await expect(
            authorPage.getByRole('navigation', {name: 'Site Navigation'})
        ).toBeVisible({timeout: 30_000});
        await expect(authorPage.getByRole('link', {name: 'Start A New Submission'})).toHaveCount(0);
        const start = new StartSubmissionPage(authorPage, journal.path);
        await start.goto();
        await expect(start.notAcceptingNotice()).toBeVisible({timeout: 30_000});
        await expect(start.beginButton()).toHaveCount(0);

        // Positive control: re-enabling brings the sidebar entry back.
        await managerPage.goto(`/index.php/${journal.path}/management/settings/workflow`);
        await saveContextSettingsCheckbox(managerPage, 'Disable Submissions', false);
        await authorPage.goto(`/index.php/${journal.path}/dashboard/mySubmissions`);
        await expect(authorPage.getByRole('link', {name: 'Start A New Submission'})).toBeVisible();
    });

    test('S8: a draft outlives the closing', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        const journal = await seedScratchJournal(ojsApi, tag, {manager: true});
        const {submissionId} = await seedDraft(ojsApi, tag, journal.path, journal.author);

        // The manager disables submissions after the draft was started.
        const managerPage = await (await asUser(journal.manager)).newPage();
        await managerPage.goto(`/index.php/${journal.path}/management/settings/workflow`);
        await saveContextSettingsCheckbox(managerPage, 'Disable Submissions', true);

        // Control: the closure is live — the start screen shows the notice.
        const page = await (await asUser(journal.author)).newPage();
        const start = new StartSubmissionPage(page, journal.path);
        await start.goto();
        await expect(start.notAcceptingNotice()).toBeVisible({timeout: 30_000});

        // The draft still opens as the normal wizard, and completing it
        // still submits (scenario 8 ⚠ A1).
        const wizard = new SubmissionWizardPage(page, journal.path);
        await wizard.goto(submissionId);
        await walkDraftToReview(wizard, submissionId);
        await expect(wizard.errorBanner()).toHaveCount(0);
        await wizard.submitAndConfirm();
    });

    test('S9: a user with no role submits', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s9', testInfo);
        // The target journal (with a manager), and a second scratch context
        // that mints two accounts holding no role in the target journal.
        const journal = await seedScratchJournal(ojsApi, tag, {manager: true});
        await ojsApi.createContext({
            tag: `${tag}h`,
            users: [
                {username: `${tag}u1`, givenName: 'Uma', familyName: 'Userone', email: `${tag}u1@mail.test`, roles: ['reader']},
                {username: `${tag}u2`, givenName: 'Ugo', familyName: 'Usertwo', email: `${tag}u2@mail.test`, roles: ['reader']},
            ],
        });

        // Control for the enrolment claim: before beginning, the account is
        // not on the journal's user list at all.
        const managerPage = await (await asUser(journal.manager)).newPage();
        const usersTable = () => managerPage.getByRole('table', {name: /Current Users/});
        await managerPage.goto(`/index.php/${journal.path}/management/settings/access`);
        await expect(usersTable()).toBeVisible({timeout: 30_000});
        await expect(usersTable().getByRole('row').filter({hasText: `${tag}u1@mail.test`})).toHaveCount(0);

        // The roleless user reaches the start form and begins a submission;
        // the wizard opens normally (Rule 3, scenario 9).
        const u1Page = await (await asUser(`${tag}u1`)).newPage();
        const start = new StartSubmissionPage(u1Page, journal.path);
        await start.goto();
        await expect(start.heading()).toBeVisible({timeout: 30_000});
        await start.fillTitle(`Submission ${tag}`);
        await start.checklistBox().check();
        await start.privacyBox().check();
        await start.begin();
        const wizard = new SubmissionWizardPage(u1Page, journal.path);
        await wizard.expectLoaded();
        await wizard.expectStep('Upload Files');

        // Afterwards the account holds the journal's Author role: its user
        // row appears with "Author" in the Roles column.
        await managerPage.goto(`/index.php/${journal.path}/management/settings/access`);
        const u1Row = usersTable().getByRole('row').filter({hasText: `${tag}u1@mail.test`});
        await expect(u1Row).toBeVisible({timeout: 30_000});
        await expect(u1Row).toContainText('Author');

        // Control: with the Author role's self-registration off, the same
        // kind of user gets the "Not Allowed" page instead.
        await managerPage.goto(`/index.php/${journal.path}/management/settings/access`);
        await managerPage.locator('#roles-button').click();
        await waitForJQueryIdle(managerPage);
        await openGridRowEdit(managerPage, 'Author', 'Edit');
        const roleForm = managerPage.locator('form#userGroupForm');
        await expect(roleForm).toBeVisible({timeout: 30_000});
        await roleForm.locator('input[name="permitSelfRegistration"]').uncheck();
        await roleForm.getByRole('button', {name: 'OK', exact: true}).click();
        await waitForJQueryIdle(managerPage);

        const u2Page = await (await asUser(`${tag}u2`)).newPage();
        const start2 = new StartSubmissionPage(u2Page, journal.path);
        await start2.goto();
        await expect(u2Page.getByRole('heading', {name: 'Not Allowed'})).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            u2Page.getByText(/You are not allowed to submit to this journal because authors must be registered by the editorial staff/)
        ).toBeVisible();
        await expect(start2.beginButton()).toHaveCount(0);
    });

    test('S10: all contributors are acknowledged', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        // A fresh journal's submission acknowledgement defaults to "all
        // authors" (Settings that modify behavior).
        const journal = await seedScratchJournal(ojsApi, tag);
        const {submissionId} = await seedDraft(ojsApi, tag, journal.path, journal.author);
        const coEmail = `${tag}co@mail.test`;

        const page = await (await asUser(journal.author)).newPage();
        const wizard = new SubmissionWizardPage(page, journal.path);
        await wizard.goto(submissionId);
        await wizard.expectStep('Upload Files');
        await wizard.uploadFile();
        await wizard.continueTo('Details');
        await wizard.continueTo('Contributors');

        // Add a second contributor with a distinct email.
        await page.getByRole('button', {name: 'Add Contributor', exact: true}).click();
        // The side-modal wrapper reports visibility:hidden — anchor on inner
        // content (patterns.md locator pitfall 5).
        const modal = page.locator('[data-cy="active-modal"]').filter({hasText: 'Add Contributor'});
        await expect(modal.getByLabel(/Given Name/).first()).toBeVisible({timeout: 30_000});
        await modal.getByLabel(/Given Name/).first().fill('Cora');
        await modal.getByLabel(/Family Name/).first().fill('Coauthor');
        await modal.getByLabel('Email').fill(coEmail);
        await modal.getByLabel('Country').selectOption({label: 'Canada'});
        await modal.getByRole('checkbox', {name: 'Author', exact: true}).check();
        await modal.getByRole('button', {name: 'Save', exact: true}).click();
        await expect(page.getByText('Cora Coauthor').first()).toBeVisible({timeout: 30_000});

        // Submit.
        await wizard.continueTo('For the Editors');
        await wizard.continueToReview(submissionId);
        await expect(wizard.errorBanner()).toHaveCount(0);
        await wizard.submitAndConfirm();

        // Two acknowledgements: one to the submitter, one to the co-author.
        await pkpMail.find({to: journal.authorEmail, contains: tag});
        await pkpMail.find({to: coEmail, contains: tag});
    });

    test('S11: editors learn of the new submission', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s11', testInfo);

        // First half — a section with configured section editors, on the
        // seeded first journal (where auto-assignment works; on newer
        // journals it fails — register 🐞 A8, not asserted): the configured
        // editors are assigned and the submission reaches their dashboard.
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            section: 'ART',
        });
        const managerPage = await (await asUser('manager.maya')).newPage();
        const workflow = new WorkflowPage(managerPage, JOURNAL);
        await workflow.gotoEditorial(submissionId);
        await expect(managerPage.getByRole('heading', {name: /^participants$/i})).toBeVisible();
        for (const name of ['Diana Editor', 'Ana Section Editor', 'Omar Section Editor']) {
            await expect(managerPage.getByText(name).first()).toBeVisible({timeout: 30_000});
        }
        const anaPage = await (await asUser('sectioneditor.ana')).newPage();
        await anaPage.goto(`/index.php/${JOURNAL}/dashboard/editorial`);
        await findRowByTag(anaPage, tag);

        // Second half — a submission to a scratch journal whose section has
        // no assigned editor: the manager receives the needs-an-editor email
        // and a task notification.
        const tag2 = `${tag}b`;
        const journal = await seedScratchJournal(ojsApi, tag2, {manager: true});
        const draft = await seedDraft(ojsApi, tag2, journal.path, journal.author);
        const authorPage = await (await asUser(journal.author)).newPage();
        const wizard = new SubmissionWizardPage(authorPage, journal.path);
        await wizard.goto(draft.submissionId);
        await walkDraftToReview(wizard, draft.submissionId);
        await wizard.submitAndConfirm();

        await pkpMail.find({to: journal.managerEmail, contains: tag2});
        const scratchManagerPage = await (await asUser(journal.manager)).newPage();
        await scratchManagerPage.goto(`/index.php/${journal.path}/dashboard/editorial`);
        await scratchManagerPage.getByRole('button', {name: 'Tasks'}).click();
        await expect(
            scratchManagerPage.getByText(
                'A new article has been submitted to which an editor needs to be assigned.'
            )
        ).toBeVisible({timeout: 30_000});
    });

    test('S12: closed and restricted sections', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s12', testInfo);
        const journal = await seedScratchJournal(ojsApi, tag, {
            manager: true,
            sections: [
                {abbrev: 'ALP', title: 'Alpha'},
                {abbrev: 'BET', title: 'Beta'},
                {abbrev: 'RHO', title: 'Rho'},
                {abbrev: 'DEL', title: 'Delta'},
            ],
        });
        // A draft in the section that will be deactivated.
        const {submissionId} = await seedDraft(ojsApi, tag, journal.path, journal.author, {
            section: 'DEL',
        });

        // The manager restricts Rho to editors and deactivates Delta
        // (Settings → Journal → Sections).
        const managerPage = await (await asUser(journal.manager)).newPage();
        await managerPage.goto(`/index.php/${journal.path}/management/settings/context`);
        await managerPage.locator('#sections-button').click();
        await waitForJQueryIdle(managerPage);
        await openGridRowEdit(managerPage, 'Rho', 'Edit');
        const rhoForm = managerPage.locator('form#sectionForm');
        await expect(rhoForm).toBeVisible({timeout: 30_000});
        await rhoForm.locator('input[name="editorRestricted"]').check();
        await rhoForm.getByRole('button', {name: 'Save', exact: true}).click();
        await waitForJQueryIdle(managerPage);
        await openGridRowEdit(managerPage, 'Delta', 'Edit');
        const deltaForm = managerPage.locator('form#sectionForm');
        await expect(deltaForm).toBeVisible({timeout: 30_000});
        await deltaForm.locator('input[name="isInactive"]').check();
        await deltaForm.getByRole('button', {name: 'Save', exact: true}).click();
        await waitForJQueryIdle(managerPage);

        // The author's start form no longer offers either section …
        const authorPage = await (await asUser(journal.author)).newPage();
        const start = new StartSubmissionPage(authorPage, journal.path);
        await start.goto();
        await expect(start.sectionRadio('Alpha')).toBeVisible({timeout: 30_000});
        await expect(start.sectionRadio('Beta')).toBeVisible();
        await expect(start.sectionRadio('Rho')).toHaveCount(0);
        await expect(start.sectionRadio('Delta')).toHaveCount(0);

        // … while the manager still sees the restricted (not the
        // deactivated) one.
        const managerStart = new StartSubmissionPage(managerPage, journal.path);
        await managerStart.goto();
        await expect(managerStart.sectionRadio('Rho')).toBeVisible({timeout: 30_000});
        await expect(managerStart.sectionRadio('Delta')).toHaveCount(0);

        // The author reopening the draft in the deactivated section gets the
        // "Section Closed" page naming the section and the contact (Rule 17).
        await authorPage.goto(`/index.php/${journal.path}/submission?id=${submissionId}`);
        await expect(
            authorPage.getByRole('heading', {name: 'Section Closed'})
        ).toBeVisible({timeout: 30_000});
        await expect(
            authorPage.getByText(/is not accepting submissions to the Delta section/)
        ).toBeVisible();
        await expect(authorPage.getByText('Site Admin')).toBeVisible();
    });

    test('S13: suggest reviewers when asked', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s13', testInfo);
        const journal = await seedScratchJournal(ojsApi, tag, {manager: true});
        const {submissionId} = await seedDraft(ojsApi, tag, journal.path, journal.author);

        // Control: with the setting off (a fresh journal's default) the rail
        // has no Reviewer Suggestions step (bounded by the Review entry).
        const page = await (await asUser(journal.author)).newPage();
        const wizard = new SubmissionWizardPage(page, journal.path);
        await wizard.goto(submissionId);
        await expect(wizard.railEntry('Review')).toBeVisible();
        await expect(wizard.railEntry('Reviewer Suggestions')).toHaveCount(0);

        // The manager enables "Reviewer Suggestion at Submission" in the
        // review settings.
        const managerPage = await (await asUser(journal.manager)).newPage();
        await managerPage.goto(`/index.php/${journal.path}/management/settings/workflow`);
        await managerPage.locator('#review-button').click();
        await saveContextSettingsCheckbox(
            managerPage,
            'Allow authors to suggest potential reviewers at submission process',
            true
        );

        // The draft's wizard now shows the step before Review …
        await wizard.goto(submissionId);
        await expect(wizard.railEntry('Reviewer Suggestions')).toBeVisible({timeout: 30_000});
        const labels = await page.locator('.pkpSteps__step__label').allTextContents();
        const suggestionIndex = labels.findIndex((label) => label.includes('Reviewer Suggestions'));
        const reviewIndex = labels.findIndex((label) => /Review$/.test(label.trim()));
        expect(suggestionIndex).toBeGreaterThan(-1);
        expect(reviewIndex).toBe(suggestionIndex + 1);

        // … and the Review step gains the suggestions panel.
        await wizard.continueTo('Details');
        await wizard.continueTo('Contributors');
        await wizard.continueTo('For the Editors');
        await wizard.continueTo('Reviewer Suggestions');
        await wizard.continueToReview(submissionId);
        await expect(wizard.reviewPanel('Reviewer Suggestions')).toContainText(
            'No reviewers have been suggested for this submission.'
        );
    });
});
