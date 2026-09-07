// @ts-check
/**
 * @file playwright/tests/U21-submission-wizard.spec.js
 *
 * Submission wizard — OJS suite, one test per canonical scenario the spec
 * runs on OJS (common scenarios 1–11, 16, 17 + the OJS-specific 12–13;
 * scenario 14 is OMP-only, 15 OPS-only).
 * Spec: docs/specs/U21-submission-wizard.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as contract, a ❓ is parked, not a gap; the spec's
 * Coverage section is the record of everything else left out):
 * - A1 ❓ (S8 asserts scenario 8 as written; whether the closure should
 *   block drafts stays open), A2 ❓ (only the presser-is-author case in S3;
 *   S4 uses the manager's save-for-later mail only as a mailbox control),
 *   A3 ❓ (S7 asserts the notice's first sentence only), A9 ❓, OPS2, OPS4,
 *   OPS6 ❓.
 * - A4 🐞 (the footer's "Last saved" before any save has run), A5 🐞 (the
 *   copyright-agreed log line's "{$filename}" placeholder; S16 asserts the
 *   entry's presence only), A6 🐞, A7 🐞 (S10 asserts the silence, never the
 *   completion screen's wording), A8 🐞 (S11 asserts auto-assignment on the
 *   seeded first journal and the needs-editor path on a section with NO
 *   configured editor), A10 🐞, OPS3, OPS5, OPS7 🐞.
 * - T-ojs-1 (scenario 12's manager draft in a deactivated section, which
 *   the app answers with the "Section Closed" page, not the wizard) and
 *   T-ojs-2 (scenario 17's control on the seeded journal, whose Details
 *   step shows an optional "Keywords" field): `.reports/U21/test-ojs-findings.md`,
 *   run of 2026-09-07; the contradicted reads are left out until the fold
 *   settles them.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only (journal-level state runs on scratch journals with throwaway
 * users, configured through the context passthrough keys: `sections[]`
 * with `wordCount`, `supportedSubmissionLocales`, `copyrightNotice`,
 * `metadata`, `submissionAcknowledgement` and its two copy keys). Mailpit
 * assertions are scoped by unique throwaway recipients (PRINCIPLES A8) and
 * every silence is bounded by a control message read the same way. Waits
 * are event-based (the Review check on its own `_validateOnly` response, the
 * autosave on its own PUT and the footer's frame-level "Saving" read; step
 * changes flush autosaves at the source) — no hard-coded sleeps. Everything
 * runs in the parallel `ojs` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    StartSubmissionPage,
    SubmissionWizardPage,
    FIXTURE_PDF_NAME,
} = require('../pages/SubmissionWizardPage.js');
const {WorkflowPage} = require('../pages/ReviewStagePages.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {getPassword} = require('../../../../shared/playwright/data/users.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

const JOURNAL = 'publicknowledge';
const COMMENT_FOR_EDITOR = 'Please note the data set is under embargo.';
const LONG_ABSTRACT =
    'This abstract has more words than the section allows, fourteen of them in all.';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u21${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Seed a scratch journal named by the tag, with a throwaway author (always)
 * and optionally a throwaway manager and section editor. Usernames/emails
 * carry the tag so Mailpit assertions stay recipient-scoped (A8). `settings`
 * are context passthrough keys (scenarios.md "Configuring a scratch
 * context"); `authorNames` a locale map for the author's given/family name.
 */
async function seedScratchJournal(
    ojsApi,
    tag,
    {manager = false, sectionEditor = false, context = {}, sections, settings = {}, authorNames} = {}
) {
    const users = [
        {
            username: `${tag}au`,
            givenName: authorNames ? authorNames.givenName : 'Ada',
            familyName: authorNames ? authorNames.familyName : 'Author',
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
    if (sectionEditor) {
        users.push({
            username: `${tag}se`,
            givenName: 'Sam',
            familyName: 'Sectioneditor',
            email: `${tag}se@mail.test`,
            roles: ['sectionEditor'],
        });
    }
    const spec = {tag, context, users, ...settings};
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
        sectionEditor: `${tag}se`,
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
 * `onForTheEditors` runs on that step before Continue.
 */
async function walkDraftToReview(wizard, submissionId, {onForTheEditors} = {}) {
    await wizard.expectStep('Upload Files');
    await wizard.uploadFile();
    await wizard.continueTo('Details');
    await wizard.continueTo('Contributors');
    await wizard.continueTo('For the Editors');
    if (onForTheEditors) {
        await onForTheEditors();
    }
    await wizard.continueToReview(submissionId);
}

/**
 * Add a second contributor with the given email on the Contributors step
 * (names in the form's first, primary-locale boxes only).
 */
async function addContributor(page, email, {givenName = 'Cora', familyName = 'Coauthor'} = {}) {
    await page.getByRole('button', {name: 'Add Contributor', exact: true}).click();
    // The side-modal wrapper reports visibility:hidden — anchor on inner
    // content (patterns.md locator pitfall 5).
    const modal = page.locator('[data-cy="active-modal"]').filter({hasText: 'Add Contributor'});
    await expect(modal.getByLabel(/Given Name/).first()).toBeVisible({timeout: 30_000});
    await modal.getByLabel(/Given Name/).first().fill(givenName);
    await modal.getByLabel(/Family Name/).first().fill(familyName);
    await modal.getByLabel('Email').fill(email);
    await modal.getByLabel('Country').selectOption({label: 'Canada'});
    await modal.getByRole('checkbox', {name: 'Author', exact: true}).check();
    await modal.getByRole('button', {name: 'Save', exact: true}).click();
    await expect(page.getByText(`${givenName} ${familyName}`).first()).toBeVisible({timeout: 30_000});
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
 * Search the dashboard list for a tag and assert no row carries it
 * (absence bounded by the search's own filtered response).
 */
async function expectNoRowByTag(page, tag) {
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

/**
 * On the Sections grid already open, set one flag of a section's edit form
 * (`editorRestricted` or `isInactive`) and save.
 */
async function setSectionFlag(managerPage, sectionTitle, flagName, checked) {
    await openGridRowEdit(managerPage, sectionTitle, 'Edit');
    const form = managerPage.locator('form#sectionForm');
    await expect(form).toBeVisible({timeout: 30_000});
    const box = form.locator(`input[name="${flagName}"]`);
    if (checked) {
        await box.check();
    } else {
        await box.uncheck();
    }
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    await waitForJQueryIdle(managerPage);
}

/** Open the Sections grid of a journal's settings as the manager. */
async function openSectionsGrid(managerPage, contextPath) {
    await managerPage.goto(`/index.php/${contextPath}/management/settings/context`);
    await managerPage.locator('#sections-button').click();
    await waitForJQueryIdle(managerPage);
}

/** Open the workflow's "Activity Log & Notes" window and wait for its grid. */
async function openActivityLog(page) {
    await page.getByRole('button', {name: 'Activity Log', exact: true}).click();
    const dialog = page.getByRole('dialog').filter({hasText: 'Activity Log & Notes'});
    await expect(dialog.getByText('Event', {exact: true})).toBeVisible({timeout: 30_000});
    return dialog;
}

test.describe('submission wizard', () => {
    test('S1: start a submission from the sidebar', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
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

        // No affiliation: a throwaway Author whose profile carries none (the
        // seeder creates it so) starts a draft the same way, and the
        // Contributors step already lists them as primary contact (Rule 5).
        const journal = await seedScratchJournal(ojsApi, tag);
        const bare = await (await asUser(journal.author)).newPage();
        const bareStart = new StartSubmissionPage(bare, journal.path);
        await bareStart.goto();
        await expect(bareStart.heading()).toBeVisible({timeout: 30_000});
        await bareStart.fillTitle(`Submission ${tag}`);
        await bareStart.checklistBox().check();
        await bareStart.privacyBox().check();
        await bareStart.begin();
        const bareWizard = new SubmissionWizardPage(bare, journal.path);
        await bareWizard.expectLoaded();
        await bareWizard.expectStep('Upload Files');
        await bareWizard.continueTo('Details');
        await bareWizard.continueTo('Contributors');
        await expect(bareWizard.contributorItem('Ada Author')).toBeVisible({timeout: 30_000});
        await expect(bareWizard.primaryContactBadge('Ada Author')).toBeVisible();
    });

    test('S2: fill every step and submit', {tag: '@smoke'}, async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const journal = await seedScratchJournal(ojsApi, tag, {manager: true});
        const {submissionId} = await seedDraft(ojsApi, tag, journal.path, journal.author);
        const second = await seedDraft(ojsApi, `${tag}b`, journal.path, journal.author);

        const page = await (await asUser(journal.author)).newPage();
        const wizard = new SubmissionWizardPage(page, journal.path);
        await wizard.goto(submissionId);

        // Upload a file, pass Details (title and abstract ride in from the
        // seed; a fresh journal asks for keywords but requires none), confirm
        // yourself on Contributors, pass For the Editors.
        await wizard.expectStep('Upload Files');
        await wizard.uploadFile();
        await wizard.continueTo('Details');
        await wizard.continueTo('Contributors');
        await expect(page.getByText('Ada Author').first()).toBeVisible();
        await wizard.continueTo('For the Editors');

        // Review: the check clears with no problems banner (bounded by the
        // validation response and the rendered panels); with no copyright
        // notice there is no Confirmation section (scenario 16's control).
        await wizard.continueToReview(submissionId);
        await expect(wizard.reviewPanel('Files')).toBeVisible();
        await expect(wizard.reviewPanel('Files')).toContainText(FIXTURE_PDF_NAME);
        await expect(wizard.reviewPanel('For the Editors')).toBeVisible();
        await expect(wizard.errorBanner()).toHaveCount(0);
        await expect(wizard.confirmationHeading()).toHaveCount(0);
        await expect(wizard.copyrightBox()).toHaveCount(0);
        await expect(wizard.submitButton()).toBeEnabled();

        // Submit and confirm the dialog (Rule 14) → "Submission complete"
        // with its three links (Rule 15).
        await wizard.submitAndConfirm();
        await expect(page.getByRole('link', {name: 'Review this submission'})).toBeVisible();
        await expect(page.getByRole('link', {name: 'Create a new submission'})).toBeVisible();
        await expect(page.getByRole('link', {name: 'Return to your dashboard'})).toBeVisible();

        // The acknowledgement email arrives in the mail catcher.
        await pkpMail.find({to: journal.authorEmail, contains: `Submission ${tag}`});

        // "Review this submission" opens the submission's workflow; its
        // activity log (read on the editorial workflow screen, footnote s)
        // holds the "submission submitted" entry (OJS words it "Article
        // submitted").
        await page.getByRole('link', {name: 'Review this submission'}).click();
        await expect(page.getByRole('heading', {name: /^Workflow:/})).toBeVisible({timeout: 30_000});
        const managerPage = await (await asUser(journal.manager)).newPage();
        const workflow = new WorkflowPage(managerPage, journal.path);
        await workflow.gotoEditorial(submissionId);
        const log = await openActivityLog(managerPage);
        await expect(log.getByText('Article submitted', {exact: true})).toBeVisible();

        // The wizard address after submitting answers with "Submission
        // complete" and no "Cancel" control (Rule 15); the control is the
        // second draft, not yet submitted, whose address answers with the
        // wizard itself and "Cancel" in its footer.
        await page.goto(wizard.wizardUrl(submissionId));
        await expect(wizard.completeHeading()).toBeVisible({timeout: 30_000});
        await expect(page.getByRole('link', {name: 'Review this submission'})).toBeVisible();
        await expect(wizard.cancelButton()).toHaveCount(0);
        await wizard.goto(second.submissionId);
        await expect(wizard.cancelButton()).toBeVisible();

        // Comments for the Editor: on the second draft, in a section with no
        // editor assigned, type a comment on For the Editors and submit.
        await walkDraftToReview(wizard, second.submissionId, {
            onForTheEditors: () => wizard.fillCommentsForEditor(COMMENT_FOR_EDITOR),
        });
        await expect(wizard.errorBanner()).toHaveCount(0);
        await wizard.submitAndConfirm();

        // The submission's workflow shows the comment as a discussion, and
        // a copy arrives in the author's mailbox (the author being its only
        // participant; Side effects).
        const authorWorkflow = new WorkflowPage(page, journal.path);
        await authorWorkflow.gotoAuthor(second.submissionId);
        await expect(
            page.getByRole('heading', {name: 'Desk Review Tasks & Discussions'})
        ).toBeVisible({timeout: 30_000});
        await expect(page.getByText('Comments for the Editor').first()).toBeVisible();
        const copy = await pkpMail.find({to: journal.authorEmail, contains: COMMENT_FOR_EDITOR});
        expect(copy.Subject).toContain('Comments for the Editor');
    });

    test('S3: save for later and resume', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const journal = await seedScratchJournal(ojsApi, tag);
        const {submissionId} = await seedDraft(ojsApi, tag, journal.path, journal.author);
        const control = await seedDraft(ojsApi, `${tag}b`, journal.path, journal.author);
        const newTitle = `Autosave check ${tag}`;

        const page = await (await asUser(journal.author)).newPage();
        const wizard = new SubmissionWizardPage(page, journal.path);
        await wizard.goto(submissionId);
        await wizard.continueTo('Details');

        // Autosave (Rule 9): type in Title and stop; with no further action
        // the wizard saves on its own clock, the footer flashing "Saving"
        // (read frame by frame) and then ticking "Last saved … ago" again
        // from the real save. Both waits are armed before typing stops. The
        // footer's reading before any save is register 🐞 A4, not asserted.
        const savingFlash = wizard.waitForSavingFlash();
        const autosaved = wizard.armAutosave(submissionId);
        await wizard.fillTitle(newTitle);
        const response = await autosaved;
        expect(response.ok()).toBeTruthy();
        await savingFlash;
        await expect(wizard.lastSavedStatus()).toContainText(/Last saved .*second.*ago/, {timeout: 30_000});

        // Save for Later → the Saved for Later screen: a link naming the
        // draft's contributors and title, and the emailed-copy note (Rule 10).
        await wizard.saveForLater();
        const resumeLink = page.getByRole('link', {name: new RegExp(newTitle)});
        await expect(resumeLink).toBeVisible();
        // The contributors part of the label is the family name ("Author").
        await expect(resumeLink).toContainText(/Author\s*—\s*Autosave check/);
        await expect(
            page.getByText(`We have emailed a copy of this link to you at ${journal.authorEmail}.`)
        ).toBeVisible();

        // The email with the resume link arrives.
        const message = await pkpMail.find({to: journal.authorEmail, contains: tag});
        const full = await pkpMail.fullMessage(message.ID);
        const link = pkpMail.extractLink(full.HTML, new RegExp(tag));
        expect(link).toBeTruthy();

        // Signed out, the emailed link shows the Login page.
        await page.goto(`/index.php/${journal.path}/login/signOut`);
        await page.goto(link);
        const login = new LoginPage(page);
        await expect(login.usernameInput).toBeVisible({timeout: 30_000});
        await expect(page.locator('.pkpSteps')).toHaveCount(0);

        // Resume: sign in and follow the link: the wizard reopens on
        // Details, the step left, with the typed title.
        await login.signIn(journal.author, getPassword(journal.author));
        await page.goto(link);
        await wizard.expectLoaded();
        await wizard.expectStep('Details');
        await expect(wizard.titleEditorBody()).toContainText(newTitle);

        // Control: a second draft moved to Details by "Continue" and never
        // saved for later reopens from My Submissions at Upload Files
        // (Rule 6).
        await wizard.goto(control.submissionId);
        await wizard.continueTo('Details');
        await page.goto(`/index.php/${journal.path}/dashboard/mySubmissions`);
        const row = await findRowByTag(page, `${tag}b`);
        await row.getByRole('button', {name: 'Complete submission', exact: true}).click();
        await wizard.expectLoaded();
        await wizard.expectStep('Upload Files');
        expect(new URL(page.url()).searchParams.get('id')).toBe(String(control.submissionId));
    });

    test('S4: cancel a draft', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        // A scratch journal so the author's and the manager's mailboxes are
        // throwaway addresses of their own (A8).
        const journal = await seedScratchJournal(ojsApi, tag, {manager: true, sectionEditor: true});
        const own = await seedDraft(ojsApi, `${tag}a`, journal.path, journal.author);
        const other = await seedDraft(ojsApi, `${tag}b`, journal.path, journal.author);
        const assigned = await seedDraft(ojsApi, `${tag}c`, journal.path, journal.author, {
            participants: [{username: journal.sectionEditor, role: 'sectionEditor'}],
        });

        // Control: the assigned Section Editor opens the draft's wizard but
        // is offered no "Cancel" (bounded by the footer's other buttons).
        const sePage = await (await asUser(journal.sectionEditor)).newPage();
        const seWizard = new SubmissionWizardPage(sePage, journal.path);
        await seWizard.goto(assigned.submissionId);
        await expect(seWizard.saveForLaterButton()).toBeVisible();
        await expect(seWizard.continueButton()).toBeVisible();
        await expect(seWizard.cancelButton()).toHaveCount(0);

        // The author's own draft is on My Submissions (positive control for
        // its disappearance below).
        const page = await (await asUser(journal.author)).newPage();
        await page.goto(`/index.php/${journal.path}/dashboard/mySubmissions`);
        await findRowByTag(page, `${tag}a`);

        // Cancel through the footer control and its warning dialog (Rule 16).
        const wizard = new SubmissionWizardPage(page, journal.path);
        await wizard.goto(own.submissionId);
        await wizard.cancelAndConfirm();
        await expect(page.getByRole('link', {name: 'Create a new submission'})).toBeVisible();
        await expect(page.getByRole('link', {name: 'Return to your dashboard'})).toBeVisible();

        // The draft is gone from My Submissions.
        await page.goto(`/index.php/${journal.path}/dashboard/mySubmissions`);
        await expectNoRowByTag(page, `${tag}a`);

        // The Journal Manager on another author's draft: its wizard offers
        // "Cancel"; confirming lands on "Submission cancelled".
        const managerPage = await (await asUser(journal.manager)).newPage();
        const managerWizard = new SubmissionWizardPage(managerPage, journal.path);
        await managerWizard.goto(other.submissionId);
        await expect(managerWizard.cancelButton()).toBeVisible();
        await managerWizard.cancelAndConfirm();
        await expect(managerPage.getByRole('link', {name: 'Create a new submission'})).toBeVisible();

        // Mailboxes: no email arrives for either cancel. The bound is the
        // manager's own "Save for Later" on the surviving draft, whose
        // resume-link mail goes to the presser (Rule 10) and is sent after
        // both cancels; once it is in, each mailbox is counted.
        await managerWizard.goto(assigned.submissionId);
        await managerWizard.saveForLater();
        await pkpMail.find({to: journal.managerEmail, contains: `${tag}c`});
        expect(await pkpMail.count({to: journal.managerEmail})).toBe(1);
        expect(await pkpMail.count({to: journal.authorEmail})).toBe(0);
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

        // Control: reopened from My Submissions the draft still names them.
        await page.goto(`/index.php/${journal.path}/dashboard/mySubmissions`);
        const row = await findRowByTag(page, tag);
        await row.getByRole('button', {name: 'Complete submission', exact: true}).click();
        await wizard.expectLoaded();
        await expect(wizard.submittingToLine()).toContainText('Beta');
        await expect(wizard.submittingToLine()).toContainText(/Français|French/);
    });

    test('S6: validation blocks an empty submission', async ({asUser, ojsApi}, testInfo) => {
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

        // A contributor named in another language only: on a bilingual
        // scratch journal a second draft gets a second contributor named in
        // English, then switches its submission language to French (the
        // contributor form itself requires the name in the language of the
        // moment, so the state is reached the way an author reaches it).
        // Title and abstract are seeded in both languages, and the author's
        // own names too, so the contributors complaint is the second
        // contributor's alone.
        const bilingual = await seedScratchJournal(ojsApi, `${tag}b`, {
            context: {
                supportedLocales: ['en', 'fr_CA'],
                supportedSubmissionLocales: ['en', 'fr_CA'],
            },
            authorNames: {
                givenName: {en: 'Ada', fr_CA: 'Ada'},
                familyName: {en: 'Author', fr_CA: 'Author'},
            },
        });
        const second = await seedDraft(ojsApi, `${tag}b`, bilingual.path, bilingual.author, {
            locale: 'en',
            title: {en: `Submission ${tag}b`, fr_CA: `Soumission ${tag}b`},
            abstract: {en: `Abstract for ${tag}b.`, fr_CA: `Résumé pour ${tag}b.`},
        });
        const page2 = await (await asUser(bilingual.author)).newPage();
        const wizard2 = new SubmissionWizardPage(page2, bilingual.path);
        await wizard2.goto(second.submissionId);
        await wizard2.expectStep('Upload Files');
        await wizard2.uploadFile();
        await wizard2.continueTo('Details');
        await wizard2.continueTo('Contributors');
        await addContributor(page2, `${tag}bco@mail.test`);
        await wizard2.changeButton().click();
        const modal = wizard2.reconfigureModal();
        await expect(modal.getByText('Change Submission Settings')).toBeVisible({timeout: 30_000});
        await modal.getByRole('radio', {name: /Français|French/}).check();
        await modal.getByRole('button', {name: 'Save', exact: true}).click();
        await expect(wizard2.submittingToLine()).toContainText(/Français|French/, {timeout: 45_000});
        await wizard2.expectStep('Upload Files');
        await wizard2.continueTo('Details');
        await wizard2.continueTo('Contributors');
        await wizard2.continueTo('For the Editors');
        await wizard2.continueToReview(second.submissionId);
        await expect(wizard2.errorBanner()).toBeVisible();
        await expect(wizard2.reviewPanel('Contributors')).toContainText(
            /The given name is missing in .* for one or more of the contributors\./
        );
        await expect(wizard2.reviewPanel(/^Files$/)).toContainText(FIXTURE_PDF_NAME);
        await expect(wizard2.submitButton()).toBeDisabled();
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
        await expect(start2.notAllowedHeading()).toBeVisible({timeout: 30_000});
        await expect(
            u2Page.getByText(/You are not allowed to submit to this journal because authors must be registered by the editorial staff/)
        ).toBeVisible();
        await expect(start2.beginButton()).toHaveCount(0);
    });

    test('S10: all contributors are acknowledged', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s10', testInfo);

        /** Seed a draft, walk it to Review (adding a co-author when asked) and submit. */
        async function submitDraft(journal, draftTag, {coEmail} = {}) {
            const draft = await seedDraft(ojsApi, draftTag, journal.path, journal.author);
            const page = await (await asUser(journal.author)).newPage();
            const wizard = new SubmissionWizardPage(page, journal.path);
            await wizard.goto(draft.submissionId);
            await wizard.expectStep('Upload Files');
            await wizard.uploadFile();
            await wizard.continueTo('Details');
            await wizard.continueTo('Contributors');
            if (coEmail) {
                await addContributor(page, coEmail);
            }
            await wizard.continueTo('For the Editors');
            await wizard.continueToReview(draft.submissionId);
            await expect(wizard.errorBanner()).toHaveCount(0);
            await wizard.submitAndConfirm();
            return `Submission ${draftTag}`;
        }

        // A fresh journal's "Submission Confirmation" is all authors (the
        // default); this one also copies the journal's contact and an extra
        // address (the "Copies" bullet, seeded through the Emails keys).
        const contactEmail = `${tag}ct@mail.test`;
        const copyEmail = `${tag}cc@mail.test`;
        const journal = await seedScratchJournal(ojsApi, `${tag}a`, {
            context: {contactName: 'Cora Contact', contactEmail},
            settings: {
                submissionAcknowledgement: 'allAuthors',
                copySubmissionAckPrimaryContact: true,
                copySubmissionAckAddress: copyEmail,
            },
        });

        // A second contributor with a distinct email: two acknowledgements,
        // one in the author's mailbox, one in the co-author's.
        const coEmail = `${tag}aco@mail.test`;
        const title = await submitDraft(journal, `${tag}a1`, {coEmail});
        const own = await pkpMail.find({to: journal.authorEmail, contains: title});
        const co = await pkpMail.find({to: coEmail});

        // Copies: the author's acknowledgement is copied to the journal's
        // contact and blind-copied to the extra address; the co-author's
        // message goes to them alone.
        const ownFull = await pkpMail.fullMessage(own.ID);
        const ownCopies = [...(ownFull.Cc || []), ...(ownFull.Bcc || [])].map((a) => a.Address);
        expect(ownCopies).toContain(contactEmail);
        expect(ownCopies).toContain(copyEmail);
        const coFull = await pkpMail.fullMessage(co.ID);
        expect((coFull.To || []).map((a) => a.Address)).toEqual([coEmail]);
        expect(coFull.Cc || []).toEqual([]);
        expect(coFull.Bcc || []).toEqual([]);

        // Control: under all authors, a submission whose only contributor
        // is the author produces exactly one acknowledgement.
        const controlTitle = await submitDraft(journal, `${tag}a2`);
        await pkpMail.find({to: journal.authorEmail, contains: controlTitle});
        expect(await pkpMail.count({to: journal.authorEmail, contains: controlTitle})).toBe(1);

        // Submitting author only: one email, in the author's mailbox; none
        // reaches the co-author (bounded by the author's).
        const onlyJournal = await seedScratchJournal(ojsApi, `${tag}c`, {
            settings: {submissionAcknowledgement: 'submittingAuthor'},
        });
        const onlyCo = `${tag}cco@mail.test`;
        const onlyTitle = await submitDraft(onlyJournal, `${tag}c1`, {coEmail: onlyCo});
        await pkpMail.expectNone({
            to: onlyCo,
            afterControl: {to: onlyJournal.authorEmail, contains: onlyTitle},
        });
        expect(await pkpMail.count({to: onlyJournal.authorEmail})).toBe(1);

        // Off: no acknowledgement arrives (bounded by the manager's
        // needs-an-editor mail for the same submission). The completion
        // screen's wording is register 🐞 A7, not asserted.
        const offJournal = await seedScratchJournal(ojsApi, `${tag}d`, {
            manager: true,
            settings: {submissionAcknowledgement: 'off'},
        });
        const offTitle = await submitDraft(offJournal, `${tag}d1`);
        await pkpMail.expectNone({
            to: offJournal.authorEmail,
            afterControl: {to: offJournal.managerEmail, contains: offTitle},
        });
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
        test.setTimeout(300_000);
        const tag = makeTag('s12', testInfo);
        // Several open sections, Alpha with an abstract word limit of 10
        // (the `sections[].wordCount` passthrough).
        const journal = await seedScratchJournal(ojsApi, tag, {
            manager: true,
            sections: [
                {abbrev: 'ALP', title: 'Alpha', wordCount: 10},
                {abbrev: 'BET', title: 'Beta'},
                {abbrev: 'RHO', title: 'Rho'},
                {abbrev: 'DEL', title: 'Delta'},
            ],
        });
        // The author's draft in the section that will be deactivated, one in
        // the word-limited section, and the manager's own draft in the
        // section to be restricted.
        const {submissionId} = await seedDraft(ojsApi, tag, journal.path, journal.author, {
            section: 'DEL',
        });
        const limited = await seedDraft(ojsApi, `${tag}w`, journal.path, journal.author, {
            section: 'ALP',
        });
        const managerRestricted = await seedDraft(ojsApi, `${tag}r`, journal.path, journal.manager, {
            section: 'RHO',
        });

        // The manager restricts Rho to editors and deactivates Delta
        // (Settings → Journal → Sections).
        const managerPage = await (await asUser(journal.manager)).newPage();
        await openSectionsGrid(managerPage, journal.path);
        await setSectionFlag(managerPage, 'Rho', 'editorRestricted', true);
        await setSectionFlag(managerPage, 'Delta', 'isInactive', true);

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

        // Word limit: on the Alpha draft, a 14-word abstract makes Review's
        // Details panel report the abstract as too long; Submit is disabled
        // (Rule 13).
        const authorWizard = new SubmissionWizardPage(authorPage, journal.path);
        await authorWizard.goto(limited.submissionId);
        await authorWizard.expectStep('Upload Files');
        await authorWizard.uploadFile();
        await authorWizard.continueTo('Details');
        await authorWizard.fillRichText('titleAbstract-abstract-control-en', LONG_ABSTRACT);
        await authorWizard.continueTo('Contributors');
        await authorWizard.continueTo('For the Editors');
        await authorWizard.continueToReview(limited.submissionId);
        await expect(authorWizard.errorBanner()).toBeVisible();
        await expect(authorWizard.reviewPanel('Details')).toContainText('The abstract is too long');
        await expect(authorWizard.submitButton()).toBeDisabled();

        // The author reopening the draft in the deactivated section gets the
        // "Section Closed" page naming the section and the contact (Rule 17).
        await authorPage.goto(`/index.php/${journal.path}/submission?id=${submissionId}`);
        await expect(authorWizard.sectionClosedHeading()).toBeVisible({timeout: 30_000});
        await expect(
            authorPage.getByText(/is not accepting submissions to the Delta section/)
        ).toBeVisible();
        await expect(authorPage.getByText('Site Admin')).toBeVisible();

        // An editor's draft: the manager's own draft in the restricted
        // section opens as the wizard, and Review raises no section
        // complaint (the check passes outright).
        const managerWizard = new SubmissionWizardPage(managerPage, journal.path);
        await managerWizard.goto(managerRestricted.submissionId);
        await expect(managerWizard.sectionClosedHeading()).toHaveCount(0);
        await walkDraftToReview(managerWizard, managerRestricted.submissionId);
        await expect(managerWizard.reviewPanel('Files')).toContainText(FIXTURE_PDF_NAME);
        await expect(managerPage.getByText(/is not accepting submissions to the Rho section/)).toHaveCount(0);
        await expect(managerWizard.errorBanner()).toHaveCount(0);
        await expect(managerWizard.submitButton()).toBeEnabled();

        // The manager's own draft in the deactivated section is not read:
        // its wizard address answered the "Section Closed" page instead of
        // the wizard (T-ojs-1, `.reports/U21/test-ojs-findings.md`), so the
        // scenario's Review-step reading could not be taken.

        // Every section closed: the manager deactivates the remaining open
        // sections too; the author's "Make a Submission" is the "Not
        // Allowed" page (Rule 3).
        await openSectionsGrid(managerPage, journal.path);
        await setSectionFlag(managerPage, 'Alpha', 'isInactive', true);
        await setSectionFlag(managerPage, 'Beta', 'isInactive', true);
        await start.goto();
        await expect(start.notAllowedHeading()).toBeVisible({timeout: 30_000});
        await expect(
            authorPage.getByText(/submissions to all sections of this journal have been deactivated or restricted/)
        ).toBeVisible();
        await expect(start.beginButton()).toHaveCount(0);

        // Control: reactivating deactivated sections (two, so the form shows
        // a choice at all; Rule 4) offers them to the author again.
        await openSectionsGrid(managerPage, journal.path);
        await setSectionFlag(managerPage, 'Delta', 'isInactive', false);
        await setSectionFlag(managerPage, 'Alpha', 'isInactive', false);
        await start.goto();
        await expect(start.sectionRadio('Delta')).toBeVisible({timeout: 30_000});
        await expect(start.sectionRadio('Alpha')).toBeVisible();
        await expect(start.sectionRadio('Beta')).toHaveCount(0);
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

    test('S16: the copyright confirmation', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s16', testInfo);
        // A journal with a copyright notice (the `copyrightNotice` passthrough).
        const journal = await seedScratchJournal(ojsApi, tag, {
            manager: true,
            settings: {copyrightNotice: `<p>Authors of ${tag} agree to the journal's copyright terms.</p>`},
        });
        const {submissionId} = await seedDraft(ojsApi, tag, journal.path, journal.author);

        const page = await (await asUser(journal.author)).newPage();
        const wizard = new SubmissionWizardPage(page, journal.path);
        await wizard.goto(submissionId);
        await walkDraftToReview(wizard, submissionId);

        // The check passes with no banner, and a final "Confirmation"
        // section asks for the copyright agreement; Submit stays disabled
        // while the box is unticked (Rules 12, 14).
        await expect(wizard.reviewPanel('Files')).toContainText(FIXTURE_PDF_NAME);
        await expect(wizard.errorBanner()).toHaveCount(0);
        await expect(wizard.confirmationHeading()).toBeVisible();
        await expect(wizard.copyrightBox()).toBeVisible();
        await expect(wizard.copyrightBox()).not.toBeChecked();
        await expect(wizard.submitButton()).toBeDisabled();

        // Tick it, submit and confirm: "Submission complete".
        await wizard.copyrightBox().check();
        await expect(wizard.submitButton()).toBeEnabled();
        await wizard.submitAndConfirm();
        await page.getByRole('link', {name: 'Review this submission'}).click();
        await expect(page.getByRole('heading', {name: /^Workflow:/})).toBeVisible({timeout: 30_000});

        // The activity log (read on the editorial workflow screen, footnote
        // s) holds the "submission submitted" entry and a "copyright agreed"
        // entry. Its opening placeholder is register 🐞 A5, not asserted.
        const managerPage = await (await asUser(journal.manager)).newPage();
        const workflow = new WorkflowPage(managerPage, journal.path);
        await workflow.gotoEditorial(submissionId);
        const log = await openActivityLog(managerPage);
        await expect(log.getByText('Article submitted', {exact: true})).toBeVisible();
        await expect(log.getByText(/agreed to the copyright terms for submission\./)).toBeVisible();
    });

    test('S17: required metadata blocks the submit', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s17', testInfo);
        // A journal whose setup requires keywords during submission (the
        // `metadata` passthrough).
        const journal = await seedScratchJournal(ojsApi, tag, {
            settings: {metadata: {keywords: 'require'}},
        });
        const {submissionId} = await seedDraft(ojsApi, tag, journal.path, journal.author);

        const page = await (await asUser(journal.author)).newPage();
        const wizard = new SubmissionWizardPage(page, journal.path);
        await wizard.goto(submissionId);
        await wizard.expectStep('Upload Files');
        await wizard.uploadFile();

        // Details shows a "Keywords" field; leave it empty and reach Review:
        // the banner, the Details panel's keywords complaint, Submit
        // disabled (Rules 7, 13).
        await wizard.continueTo('Details');
        await expect(wizard.keywordsInput()).toBeVisible();
        await wizard.continueTo('Contributors');
        await wizard.continueTo('For the Editors');
        await wizard.continueToReview(submissionId);
        await expect(wizard.errorBanner()).toBeVisible();
        await expect(wizard.reviewPanel('Details')).toContainText('Keywords');
        await expect(wizard.reviewPanel('Details')).toContainText('This field is required.');
        await expect(wizard.submitButton()).toBeDisabled();

        // "Edit" the Details panel, type a keyword and return: the complaint
        // is gone and Submit is enabled.
        await wizard.editFromPanel('Details');
        await wizard.expectStep('Details');
        await wizard.addKeyword('wizard');
        const revalidated = wizard.armValidation(submissionId);
        await wizard.gotoStep('Review');
        await revalidated;
        await expect(wizard.reviewPanel('Details')).toContainText('wizard');
        await expect(wizard.reviewPanel('Details').getByText('This field is required.')).toHaveCount(0);
        await expect(wizard.errorBanner()).toHaveCount(0);
        await expect(wizard.submitButton()).toBeEnabled();

        // Control: the scenario's control on the seeded journal (Details with
        // no "Keywords" field) is not read: that journal's Details step
        // showed an optional "Keywords" field (T-ojs-2,
        // `.reports/U21/test-ojs-findings.md`). Review passing without a
        // keyword on a journal that does not require one is S2's reading.
    });
});
