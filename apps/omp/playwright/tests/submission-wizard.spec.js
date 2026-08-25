// @ts-check
/**
 * @file playwright/tests/submission-wizard.spec.js
 *
 * U21 — Submission wizard, OMP suite (spec:
 * docs/specs/U21-submission-wizard.md). One test per canonical scenario a
 * press runs, in OMP vocabulary (press, monograph, Submission Type — glossary
 * substitution): common scenarios 1–11, then the OMP-specific scenarios 13
 * and 14 plus the press absence of scenario 12's section machinery (OMP1).
 * Scenario 15 is OPS-only (galley intake) and has no press analogue.
 *
 * Deliberate non-coverage (register IDs from the spec's Findings register —
 * 🐞 findings are never asserted as contract; ❓-parked claims are not
 * coverage gaps):
 * - A4 (🐞): nothing is asserted about the footer's "Last saved" ticker.
 * - A5 (🐞): the activity log's copyright entry is not read.
 * - A6 (🐞): no double-submit is attempted.
 * - A7 (🐞): acknowledgements stay ON in every scenario here; nothing is
 *   asserted about the completion screen's email sentence with them off.
 * - A2 (❓): S3 asserts the ordinary case (the submitting author presses
 *   "Save for Later"); who gets the email when a manager presses it is not
 *   asserted either way.
 * - A1 (❓ on intent): S8 asserts the as-built behavior the spec's canonical
 *   scenario 8 describes (a draft outlives the closing).
 * - A8 (🐞): S11's auto-assignment half runs on the seeded press — the
 *   install's oldest context, where assignment works; nothing is asserted
 *   about auto-assignment on scratch presses.
 * - Rule 9's autosave/offline mechanics (Reconnecting, unsaved-changes
 *   restore) are not canonical scenarios and are not covered.
 * - Rule 14's copyright confirmation box is not covered: no press on this
 *   install carries a copyright notice, so scenario 2's "tick any
 *   confirmation box" step is empty here.
 * - Scenario 5's language half is not covered: the install's presses carry a
 *   single submission language, so no Submission Language choice renders
 *   anywhere; the press-specific half (the ever-reconfigurable work type,
 *   OMP1) is covered by S5.
 * - Scenario 1's reader-site "Make a Submission" block (Rule 1) belongs to
 *   the sidebar-block plugin surface and is not driven here; entry is
 *   asserted via the dashboard sidebar.
 *
 * Seeding: scenario endpoints only. Drafts (`submitted: false`) on the
 * read-only `publicknowledge` press for author-only flows; scratch presses
 * (with throwaway users carrying unique mail.test addresses) wherever a
 * setting is flipped or Mailpit is read (PRINCIPLES A8 — every mail
 * assertion is scoped by a unique throwaway recipient). All tests run in the
 * parallel `omp` project; nothing global is touched.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    STEPS,
    startUrl,
    wizardUrl,
    footer,
    submittingToLine,
    railEntry,
    expectStep,
    expectWizardOpen,
    beginSubmission,
    continueTo,
    uploadWizardFile,
    openReview,
    problemsBanner,
    confirmSubmit,
    completeAndSubmitDraft,
    saveForLater,
    openChangeSettings,
} = require('../pages/SubmissionWizardPages.js');
const {
    openEditorial,
    secondaryRegion,
    assignParticipant,
    openTasksPanel,
} = require('../pages/ReviewStagePages.js');

const PK = 'publicknowledge';
const PK_PREFIX = '/en';

const WORK_TYPES = {
    monograph: 'Monograph: Authors are associated with the book as a whole.',
    editedVolume: 'Edited Volume: Authors are associated with their own chapter.',
};

/** Parallel-safe unique tag: single alphanumeric token, ≤32 chars. */
function makeTag(testInfo, scenarioKey) {
    const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6);
    return `${scenarioKey}ompw${testInfo.parallelIndex}${rand}`;
}

/**
 * Seed a scratch press whose path is the tag, with throwaway users
 * (usernames prefixed by the tag so their mail.test addresses are unique
 * per run). Returns {path, users: {key: {username, email}}}.
 */
async function seedPress(ompApi, tag, userKeys) {
    const roleByKey = {
        manager: ['manager'],
        author: ['author'],
        reader: ['reader'],
        reader2: ['reader'],
    };
    const users = {};
    const specs = userKeys.map((key) => {
        const username = `${tag}${key}`;
        users[key] = {username, email: `${username}@mail.test`};
        return {
            username,
            givenName: `U21${key}`,
            familyName: 'Tester',
            email: `${username}@mail.test`,
            roles: roleByKey[key],
        };
    });
    await ompApi.createContext({
        tag,
        context: {name: {en: `U21 Press ${tag}`}},
        users: specs,
    });
    return {path: tag, users};
}

/** Seed a wizard-resumable draft; returns the scenario response. */
async function seedDraft(ompApi, tag, {context = PK, submitter = 'author.alex', ...rest} = {}) {
    return ompApi.createSubmission({
        tag,
        context,
        submitter,
        submitted: false,
        ...rest,
    });
}

/**
 * As the press manager of a scratch press, tick or untick the workflow
 * settings' "Disable Submissions" box (Settings → Workflow → Submission).
 */
async function setDisableSubmissions(page, contextPath, disabled) {
    await page.goto(`/index.php/${contextPath}/management/settings/workflow`);
    const checkbox = page.getByRole('checkbox', {name: 'Disable Submissions'});
    await expect(checkbox).toBeVisible({timeout: 20_000});
    if (disabled) {
        await checkbox.check();
    } else {
        await checkbox.uncheck();
    }
    const saved = page.waitForResponse(
        (r) => r.url().includes('/api/v1/contexts/') && r.ok()
    );
    await page.getByRole('button', {name: 'Save', exact: true}).click();
    await saved;
}

test.describe('Submission wizard (U21)', () => {
    test.beforeEach(async ({}, testInfo) => testInfo.setTimeout(300_000));

    test('S1: start a submission from the dashboard sidebar', async ({asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s1');
        const page = await (await asUser('author.alex')).newPage();

        // The sidebar offers "Start A New Submission" (Rule 1)…
        await page.goto(`/index.php/${PK}${PK_PREFIX}/dashboard/mySubmissions`);
        await page.getByRole('link', {name: 'Start A New Submission'}).click();

        // …which lands on the "Make a Submission" start form; fill it and
        // begin (scenario 1; the Submission Type asked in place of a
        // section is OMP1).
        await beginSubmission(page, {title: `Submission ${tag}`});

        // The wizard opened on Upload Files with the submission's number
        // shown above the heading (Rules 5, 7).
        const id = new URL(page.url()).searchParams.get('id');
        expect(Number(id)).toBeGreaterThan(0);
        await expect(
            page.locator('.submissionWizard__submissionDetails')
        ).toContainText(String(id));
        await expect(page).toHaveTitle(/Make a Submission/);
    });

    test('S2: fill every step and submit; the acknowledgement arrives', async ({ompApi, pkpMail, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s2');
        const press = await seedPress(ompApi, tag, ['author']);
        const author = press.users.author;
        const seeded = await seedDraft(ompApi, tag, {
            context: press.path,
            submitter: author.username,
        });

        const page = await (await asUser(author.username)).newPage();
        await page.goto(wizardUrl(press.path, seeded.submissionId));
        await expectWizardOpen(page);

        // Upload a manuscript, pass every step, submit from Review
        // (scenario 2; the press asks no abstract — OMP1).
        await completeAndSubmitDraft(page, `ms-${tag}.txt`);

        // The completion screen offers the three links (Rule 15).
        await expect(page.getByRole('link', {name: 'Review this submission'})).toBeVisible();
        await expect(page.getByRole('link', {name: 'Create a new submission'})).toBeVisible();
        await expect(page.getByRole('link', {name: 'Return to your dashboard'})).toBeVisible();

        // The acknowledgement email reaches the submitting author (Side
        // effects; unique throwaway recipient).
        await pkpMail.find({
            to: author.email,
            subject: 'Thank you for your submission',
            timeoutMs: 30_000,
        });

        // "Review this submission" opens the submission's workflow in the
        // author's own view.
        await page.getByRole('link', {name: 'Review this submission'}).click();
        await expect(
            page
                .locator('[data-cy="active-modal"]')
                .getByRole('heading', {name: /^Workflow:/})
                .first()
        ).toBeVisible({timeout: 30_000});
    });

    test('S3: save for later and resume from the emailed link', async ({ompApi, pkpMail, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s3');
        const press = await seedPress(ompApi, tag, ['author']);
        const author = press.users.author;
        const seeded = await seedDraft(ompApi, tag, {
            context: press.path,
            submitter: author.username,
        });

        const page = await (await asUser(author.username)).newPage();
        await page.goto(wizardUrl(press.path, seeded.submissionId));
        await expectWizardOpen(page);
        await continueTo(page, STEPS.details);

        // "Save for Later" lands on the Saved for Later screen: a resume
        // link naming the submission and the emailed-copy note (Rule 10).
        await saveForLater(page);
        const resumeLink = page.locator(`a[href*="/submission?id=${seeded.submissionId}"]`);
        await expect(resumeLink).toBeVisible();
        await expect(resumeLink).toContainText(`Submission ${tag}`);
        await expect(
            page.getByText(`We have emailed a copy of this link to you at ${author.email}.`)
        ).toBeVisible();

        // The email arrives, and its link reopens the wizard on the step
        // recorded (scenario 3).
        const message = await pkpMail.find({
            to: author.email,
            subject: 'Resume your submission',
            timeoutMs: 30_000,
        });
        const full = await pkpMail.fullMessage(message.ID);
        const match = /href="([^"]*\/submission\?id=\d+[^"]*)"/.exec(full.HTML || '');
        expect(match, 'the saved-for-later email carries the wizard link').toBeTruthy();
        await page.goto(match[1].replace(/&amp;/g, '&'));
        await expectWizardOpen(page);
        await expectStep(page, STEPS.details);
    });

    test('S4: cancel a draft; an assigned series editor gets no Cancel', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s4');
        const seeded = await seedDraft(ompApi, tag);
        const draftUrl = wizardUrl(PK, seeded.submissionId, {localePrefix: PK_PREFIX});

        // A Press Manager assigns a Series Editor to the draft (control
        // seeding — the wizard is the surface under test below).
        const mayaPage = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(mayaPage, PK, seeded.submissionId);
        await assignParticipant(mayaPage, modal, {
            group: 'Series editor',
            query: 'Ana',
            resultName: 'Ana Section Editor',
        });

        // Control: the assigned Series Editor gets the wizard — Save for
        // Later and Continue offered — but no "Cancel" (Rule 16).
        const anaPage = await (await asUser('sectioneditor.ana')).newPage();
        await anaPage.goto(draftUrl);
        await expectWizardOpen(anaPage);
        await expect(
            footer(anaPage).getByRole('button', {name: 'Continue', exact: true})
        ).toBeVisible();
        await expect(
            footer(anaPage).getByRole('button', {name: 'Save for Later', exact: true})
        ).toBeVisible();
        await expect(anaPage.locator('#cancelSubmission')).toHaveCount(0);

        // The submitting author cancels: warning dialog, then the
        // "Submission cancelled" screen (Rule 16, scenario 4).
        const page = await (await asUser('author.alex')).newPage();
        await page.goto(draftUrl);
        await expectWizardOpen(page);
        await page.locator('#cancelSubmission').click();
        const dialog = page
            .getByRole('dialog')
            .filter({hasText: 'Cancel submission'});
        await expect(
            dialog.getByText(
                'Are you sure you wish to cancel this submission? This will delete the submission and all associated data. This action cannot be undone.'
            )
        ).toBeVisible({timeout: 10_000});
        await dialog.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(
            page.getByRole('heading', {name: 'Submission cancelled'})
        ).toBeVisible({timeout: 30_000});
        await expect(page.getByRole('link', {name: 'Create a new submission'})).toBeVisible();
        await expect(page.getByRole('link', {name: 'Return to your dashboard'})).toBeVisible();

        // The deleted draft's wizard address now answers a bare 404.
        const response = await page.goto(draftUrl);
        expect(response.status()).toBe(404);
    });

    test('S5: change the submission settings midway (work type — OMP1)', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s5');
        const seeded = await seedDraft(ompApi, tag);

        const page = await (await asUser('author.alex')).newPage();
        await page.goto(wizardUrl(PK, seeded.submissionId, {localePrefix: PK_PREFIX}));
        await expectWizardOpen(page);

        // The press states the work type with a "Change" control — always
        // present, even with one language (Rules 7, 11 / OMP1).
        await expect(submittingToLine(page)).toContainText('Submitting a Monograph.');

        // "Change Submission Settings" offers the Submission Type pair.
        const modal = await openChangeSettings(page);
        const monograph = modal.getByRole('radio', {name: WORK_TYPES.monograph});
        await expect(monograph).toBeChecked();
        await expect(
            modal.getByRole('radio', {name: WORK_TYPES.editedVolume})
        ).toBeVisible();

        // Pick the other type and save: the wizard reloads and the line
        // names the new type (scenario 5).
        await modal.getByRole('radio', {name: WORK_TYPES.editedVolume}).check();
        await modal.getByRole('button', {name: 'Save', exact: true}).click();
        await expect(submittingToLine(page)).toContainText(
            'Submitting an Edited Volume.',
            {timeout: 30_000}
        );
    });

    test('S6: validation blocks an empty submission until the file is fixed', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s6');
        const seeded = await seedDraft(ompApi, tag);

        const page = await (await asUser('author.alex')).newPage();
        await page.goto(wizardUrl(PK, seeded.submissionId, {localePrefix: PK_PREFIX}));
        await expectWizardOpen(page);

        // Straight to Review on "Continue" alone (scenario 6).
        await continueTo(page, STEPS.details);
        await continueTo(page, STEPS.contributors);
        await continueTo(page, STEPS.editors);
        await openReview(page);

        // The problems banner, the missing-file complaint on the Files
        // panel, and a disabled Submit (Rules 12–14; a press demands no
        // abstract — OMP1).
        await expect(problemsBanner(page)).toContainText(
            'There are one or more problems that need to be fixed before you can submit.'
        );
        const filesPanel = page
            .locator('.submissionWizard__reviewPanel')
            .filter({has: page.getByRole('heading', {name: 'Files', exact: true})});
        await expect(filesPanel).toContainText(
            /upload at least one Book Manuscript file/
        );
        await expect(
            footer(page).getByRole('button', {name: 'Submit', exact: true})
        ).toBeDisabled();

        // The panel's "Edit" jumps back to Upload Files; fix the item and
        // return: the complaint is gone and Submit enables.
        await filesPanel.getByRole('button', {name: 'Edit', exact: true}).click();
        await expectStep(page, STEPS.files);
        await uploadWizardFile(page, `ms-${tag}.txt`);
        await openReview(page, {viaRail: true});
        await expect(problemsBanner(page)).toHaveCount(0);
        await expect(filesPanel).not.toContainText(
            /upload at least one Book Manuscript file/
        );
        await expect(
            footer(page).getByRole('button', {name: 'Submit', exact: true})
        ).toBeEnabled();
    });

    test('S7: the press stops accepting submissions', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s7');
        const press = await seedPress(ompApi, tag, ['manager', 'author']);

        // Positive control: with submissions open, the author's sidebar
        // offers the entry (Rule 1).
        const authorPage = await (await asUser(press.users.author.username)).newPage();
        await authorPage.goto(`/index.php/${press.path}/dashboard/mySubmissions`);
        await expect(
            authorPage.getByRole('link', {name: 'Start A New Submission'})
        ).toBeVisible({timeout: 20_000});

        // The manager disables submissions (Rule 2).
        const managerPage = await (await asUser(press.users.manager.username)).newPage();
        await setDisableSubmissions(managerPage, press.path, true);

        // The sidebar entry disappears, and the typed start address shows
        // only the not-accepting notice (scenario 7; wording per A3 as
        // shown).
        await authorPage.goto(`/index.php/${press.path}/dashboard/mySubmissions`);
        await expect(
            authorPage.getByRole('link', {name: 'Start A New Submission'})
        ).toHaveCount(0);
        await authorPage.goto(startUrl(press.path));
        await expect(
            authorPage.getByText(
                'This press is not accepting submissions at this time. Visit the workflow settings to allow submissions.'
            )
        ).toBeVisible({timeout: 20_000});
        await expect(
            authorPage.getByRole('button', {name: 'Begin Submission'})
        ).toHaveCount(0);

        // Positive control: re-enabling brings the sidebar entry back.
        await setDisableSubmissions(managerPage, press.path, false);
        await authorPage.goto(`/index.php/${press.path}/dashboard/mySubmissions`);
        await expect(
            authorPage.getByRole('link', {name: 'Start A New Submission'})
        ).toBeVisible({timeout: 20_000});
    });

    test('S8: a draft outlives the closing and still submits', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s8');
        const press = await seedPress(ompApi, tag, ['manager', 'author']);
        const seeded = await seedDraft(ompApi, tag, {
            context: press.path,
            submitter: press.users.author.username,
        });

        // The manager closes submissions after the draft was started.
        const managerPage = await (await asUser(press.users.manager.username)).newPage();
        await setDisableSubmissions(managerPage, press.path, true);

        // The author's draft still opens as the normal wizard, and
        // completing it still submits (scenario 8 — as-built, ⚠ A1 open on
        // intent).
        const page = await (await asUser(press.users.author.username)).newPage();
        await page.goto(wizardUrl(press.path, seeded.submissionId));
        await expectWizardOpen(page);
        await expect(
            page.getByText('This press is not accepting submissions at this time', {
                exact: false,
            })
        ).toHaveCount(0);
        await completeAndSubmitDraft(page, `ms-${tag}.txt`);
    });

    test('S9: a user with no submitting role is enrolled as Author; without self-registration the start screen refuses', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s9');
        const press = await seedPress(ompApi, tag, ['manager', 'reader', 'reader2']);

        // The bare reader holds no Author role yet: the profile's Roles tab
        // shows the self-registration "Author" box unchecked.
        // (The Roles tab lists every context on the site; the current
        // press's list renders first — scope to it.)
        const currentContextAuthorBox = (page) =>
            page
                .getByRole('tabpanel', {name: 'Roles'})
                .getByRole('list')
                .first()
                .getByRole('checkbox', {name: 'Author', exact: true});
        const readerPage = await (await asUser(press.users.reader.username)).newPage();
        await readerPage.goto(`/index.php/${press.path}/user/profile`);
        await readerPage.getByRole('tab', {name: 'Roles'}).click();
        await expect(currentContextAuthorBox(readerPage)).toBeVisible({timeout: 20_000});
        await expect(currentContextAuthorBox(readerPage)).not.toBeChecked();

        // The start screen admits them and the wizard opens normally
        // (Rule 3, scenario 9).
        await readerPage.goto(startUrl(press.path));
        await beginSubmission(readerPage, {title: `Submission ${tag}`});

        // Afterwards the account holds the press's Author role.
        await readerPage.goto(`/index.php/${press.path}/user/profile`);
        await readerPage.getByRole('tab', {name: 'Roles'}).click();
        await expect(currentContextAuthorBox(readerPage)).toBeChecked({timeout: 20_000});

        // Control: the manager turns off self-registration on the press's
        // self-registering author-role groups — OMP ships TWO (Author and
        // Chapter Author), and the gate only closes when no author-role
        // group self-registers; a second bare reader then gets
        // "Not Allowed" (Rule 3).
        const managerPage = await (await asUser(press.users.manager.username)).newPage();
        await managerPage.goto(`/index.php/${press.path}/management/settings/access`);
        await managerPage.locator('#roles-button').click();
        for (const roleName of ['Author', 'Chapter Author']) {
            // (Every author-category row carries an "Author"
            // permission-level cell — match the NAME cell alone.)
            const nameCell = managerPage.locator(
                `tr.gridRow td.first_column:has(span.label:text-is("${roleName}"))`
            );
            await nameCell.locator('a.show_extras').click();
            await managerPage.getByRole('link', {name: 'Edit', exact: true}).click();
            const selfReg = managerPage.getByLabel('Allow user self-registration');
            await expect(selfReg).toBeVisible({timeout: 20_000});
            await selfReg.uncheck();
            await managerPage.getByRole('button', {name: 'OK', exact: true}).click();
            await expect(selfReg).toBeHidden({timeout: 20_000});
        }

        const reader2Page = await (await asUser(press.users.reader2.username)).newPage();
        await reader2Page.goto(startUrl(press.path));
        await expect(
            reader2Page.getByRole('heading', {name: 'Not Allowed'})
        ).toBeVisible({timeout: 20_000});
        await expect(
            reader2Page.getByText(/authors must be registered by the editorial staff/)
        ).toBeVisible();
    });

    test('S10: all contributors are acknowledged', async ({ompApi, pkpMail, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s10');
        const press = await seedPress(ompApi, tag, ['author']);
        const author = press.users.author;
        const contributorEmail = `${tag}contrib@mail.test`;
        const seeded = await seedDraft(ompApi, tag, {
            context: press.path,
            submitter: author.username,
        });

        const page = await (await asUser(author.username)).newPage();
        await page.goto(wizardUrl(press.path, seeded.submissionId));
        await expectWizardOpen(page);
        await uploadWizardFile(page, `ms-${tag}.txt`);
        await continueTo(page, STEPS.details);
        await continueTo(page, STEPS.contributors);

        // Add a second contributor with a distinct throwaway address
        // (scenario 10; the panel's own mechanics belong to Contributors &
        // affiliations).
        await page.getByRole('button', {name: 'Add Contributor'}).click();
        const modal = page.locator('[data-cy="active-modal"]').last();
        await modal.getByRole('textbox', {name: /^Given Name/}).fill(`Coauthor${tag}`);
        await modal.getByRole('textbox', {name: /^Email/}).fill(contributorEmail);
        await modal.getByRole('combobox', {name: /^Country/}).selectOption({label: 'Iceland'});
        await modal.getByRole('checkbox', {name: 'Author', exact: true}).check();
        const saved = page.waitForResponse(
            (r) => r.url().includes('/contributors') && r.ok()
        );
        await modal.getByRole('button', {name: 'Save', exact: true}).click();
        await saved;
        await expect(page.getByText(`Coauthor${tag}`).first()).toBeVisible({
            timeout: 20_000,
        });

        await continueTo(page, STEPS.editors);
        await openReview(page);
        await expect(problemsBanner(page)).toHaveCount(0);
        await confirmSubmit(page);

        // Two acknowledgements: the submitting author's, and the co-author
        // variant to the other contributor (Side effects; the press default
        // is "all authors").
        await pkpMail.find({
            to: author.email,
            subject: 'Thank you for your submission',
            timeoutMs: 30_000,
        });
        await pkpMail.find({
            to: contributorEmail,
            subject: 'Submission confirmation',
            timeoutMs: 30_000,
        });
    });

    test('S11: editors learn of the new submission', async ({ompApi, pkpMail, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s11');

        // First half — a submission into a series with configured series
        // editors: they are assigned (seeded press, where auto-assignment
        // works; the assignment email itself belongs to Stage
        // participants).
        const assigned = await ompApi.createSubmission({
            tag: `${tag}a`,
            context: PK,
            submitter: 'author.alex',
            series: 'monographs',
        });
        const mayaPage = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(mayaPage, PK, assigned.submissionId);
        const participants = secondaryRegion(modal);
        await expect(participants.getByText('Ana Section Editor')).toBeVisible({
            timeout: 20_000,
        });
        await expect(participants.getByText('Diana Editor')).toBeVisible();

        // Second half — no series, nobody assigned: every press manager
        // gets the needs-an-editor email and a task notification (Side
        // effects; scratch press so the recipient is a unique throwaway).
        const press = await seedPress(ompApi, tag, ['manager', 'author']);
        const draft = await seedDraft(ompApi, tag, {
            context: press.path,
            submitter: press.users.author.username,
        });
        const authorPage = await (await asUser(press.users.author.username)).newPage();
        await authorPage.goto(wizardUrl(press.path, draft.submissionId));
        await expectWizardOpen(authorPage);
        await completeAndSubmitDraft(authorPage, `ms-${tag}.txt`);

        await pkpMail.find({
            to: press.users.manager.email,
            subject: 'needs an editor to be assigned',
            contains: tag,
            timeoutMs: 30_000,
        });

        const managerPage = await (await asUser(press.users.manager.username)).newPage();
        await managerPage.goto(`/index.php/${press.path}/dashboard/editorial`);
        const tasks = await openTasksPanel(managerPage);
        await expect(
            tasks.getByText(
                'A new monograph has been submitted to which an editor needs to be assigned.'
            ).first()
        ).toBeVisible({timeout: 20_000});
    });

    test('S12 (absence): a press intakes by work type — no section anywhere', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s12');
        const page = await (await asUser('author.alex')).newPage();

        // The start form asks for the Submission Type (positive control)
        // and offers no Section field (OMP1 — Rule 17 has no press
        // analogue).
        await page.goto(startUrl(PK, {localePrefix: PK_PREFIX}));
        await expect(
            page.getByRole('radio', {name: WORK_TYPES.monograph})
        ).toBeVisible({timeout: 20_000});
        await expect(page.locator('legend', {hasText: 'Section'})).toHaveCount(0);

        // "Change Submission Settings" on a draft likewise offers the type
        // pair (positive control) and no Section choice.
        const seeded = await seedDraft(ompApi, tag);
        await page.goto(wizardUrl(PK, seeded.submissionId, {localePrefix: PK_PREFIX}));
        await expectWizardOpen(page);
        const modal = await openChangeSettings(page);
        await expect(
            modal.getByRole('radio', {name: WORK_TYPES.monograph})
        ).toBeVisible();
        await expect(
            modal.getByRole('radio', {name: WORK_TYPES.editedVolume})
        ).toBeVisible();
        await expect(modal.locator('legend', {hasText: 'Section'})).toHaveCount(0);
    });

    test('S13: the Reviewer Suggestions step appears when the press asks for it', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s13');
        const press = await seedPress(ompApi, tag, ['manager', 'author']);
        const seeded = await seedDraft(ompApi, tag, {
            context: press.path,
            submitter: press.users.author.username,
        });

        // Control: with the setting off (a fresh press's default), the rail
        // shows Review but no Reviewer Suggestions step (Rule 7).
        const page = await (await asUser(press.users.author.username)).newPage();
        await page.goto(wizardUrl(press.path, seeded.submissionId));
        await expectWizardOpen(page);
        await expect(railEntry(page, STEPS.review)).toBeVisible();
        await expect(railEntry(page, STEPS.reviewerSuggestions)).toHaveCount(0);

        // The manager enables "Reviewer Suggestion at Submission"
        // (Settings → Workflow → Review, scenario 13).
        const managerPage = await (await asUser(press.users.manager.username)).newPage();
        await managerPage.goto(`/index.php/${press.path}/management/settings/workflow`);
        await managerPage.locator('#review-button').click();
        const toggle = managerPage.getByRole('checkbox', {
            name: 'Allow authors to suggest potential reviewers at submission process',
        });
        await expect(toggle).toBeVisible({timeout: 20_000});
        await toggle.check();
        const saved = managerPage.waitForResponse(
            (r) => r.url().includes('/api/v1/contexts/') && r.ok()
        );
        await managerPage
            .locator('#reviewSetup')
            .getByRole('button', {name: 'Save', exact: true})
            .click();
        await saved;

        // The draft's wizard now shows the step before Review, and the
        // Review step gains the empty suggestions panel.
        await page.reload();
        await expectWizardOpen(page);
        await expect(railEntry(page, STEPS.reviewerSuggestions)).toBeVisible();
        const labels = await page
            .locator('.pkpSteps__buttons .pkpSteps__step__label')
            .allInnerTexts();
        const order = labels.map((label) => label.trim().replace(/^\d+\s*/, ''));
        expect(order.indexOf(STEPS.reviewerSuggestions)).toBeLessThan(
            order.indexOf(STEPS.review)
        );

        await continueTo(page, STEPS.details);
        await continueTo(page, STEPS.contributors);
        await continueTo(page, STEPS.editors);
        await continueTo(page, STEPS.reviewerSuggestions);
        await openReview(page);
        await expect(
            page.getByText('No reviewers have been suggested for this submission.')
        ).toBeVisible();
    });

    test('S14: submit a monograph or an edited volume (OMP1)', async ({asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s14');
        const page = await (await asUser('author.alex')).newPage();

        // The start form asks for the Submission Type; choose Edited
        // Volume (scenario 14).
        await page.goto(startUrl(PK, {localePrefix: PK_PREFIX}));
        await beginSubmission(page, {
            title: `Submission ${tag}`,
            workType: WORK_TYPES.editedVolume,
        });
        await expect(submittingToLine(page)).toContainText(
            'Submitting an Edited Volume.'
        );

        // The Details step lists the book's Chapters…
        await continueTo(page, STEPS.details);
        await expect(
            page.getByText('Chapters', {exact: true}).first()
        ).toBeVisible({timeout: 20_000});

        // …and switching back to Monograph changes only the header line —
        // the Chapters section stays.
        const modal = await openChangeSettings(page);
        await modal.getByRole('radio', {name: WORK_TYPES.monograph}).check();
        await modal.getByRole('button', {name: 'Save', exact: true}).click();
        await expect(submittingToLine(page)).toContainText('Submitting a Monograph.', {
            timeout: 30_000,
        });
        await continueTo(page, STEPS.details);
        await expect(
            page.getByText('Chapters', {exact: true}).first()
        ).toBeVisible({timeout: 20_000});

        // For the Editors offers the optional Series choice, "None"
        // preselected (the press has series).
        await continueTo(page, STEPS.contributors);
        await continueTo(page, STEPS.editors);
        const noneRadio = page.getByRole('radio', {name: 'None', exact: true});
        await expect(noneRadio).toBeVisible({timeout: 20_000});
        await expect(noneRadio).toBeChecked();
        await expect(page.getByRole('radio', {name: 'Monographs', exact: true})).toBeVisible();
        await expect(page.getByRole('radio', {name: 'Textbooks', exact: true})).toBeVisible();
    });
});
