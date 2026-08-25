// @ts-check
/**
 * @file playwright/tests/submission-wizard.spec.js
 *
 * U21 — Submission wizard, OPS suite (spec:
 * docs/specs/U21-submission-wizard.md). One test per canonical scenario a
 * preprint server runs, in OPS vocabulary (server, preprint, moderator,
 * galley — glossary substitution): common scenarios 1–11, then the
 * OPS-specific scenarios 12 (closed/restricted sections) and 15 (the galley
 * intake and its can-post control), plus one absence test covering scenario
 * 13's stated OPS control ("on a preprint server always — no such step
 * appears"), scenario 14's press-only Submission Type intake, and Rule 1's
 * reader-site "Make a Submission" block a preprint server does not install.
 *
 * Deliberate non-coverage (register IDs from the spec's Findings register —
 * 🐞 findings are never asserted as contract; ❓-parked claims are not
 * coverage gaps):
 * - OPS3 (🐞): S4's cancel is performed by the Preprint Server Manager — the
 *   only actor whose cancel works on a preprint server (spec scenario 4's
 *   own note). The submitting author's "Cancel" control is not exercised and
 *   nothing is asserted about it either way.
 * - OPS5 (🐞): S15's can-post control asserts the confirmation dialog and
 *   completion-screen wording only; no mail assertion is made for the
 *   can-post submitter in either direction.
 * - OPS2 (❓): S9 asserts the Author enrolment only after "Begin Submission"
 *   was pressed — nothing about when the enrolment actually happened.
 * - OPS4 (❓): the completion screen is only read by its own submitter here;
 *   which variant another viewer gets is not asserted.
 * - OPS6 (❓): S11 finds the needs-an-editor email by its subject; nothing is
 *   asserted about the email body's journal-vs-server wording.
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
 * - A8 (🐞): S11's auto-assignment half runs on the seeded base server — the
 *   install's oldest context, where assignment works; nothing is asserted
 *   about auto-assignment on scratch servers.
 * - Scenario 4's assigned-moderator no-Cancel control is seeded via the
 *   scenario API's participants[] key (parity ledger 2026-08-25); the
 *   participant panel's own mechanics belong to *Stage participants*.
 * - Rule 9's autosave/offline mechanics (Reconnecting, unsaved-changes
 *   restore) are not canonical scenarios and are not covered.
 * - Rule 14's copyright confirmation box is not covered: no server on this
 *   install carries a copyright notice, so scenario 2's "tick any
 *   confirmation box" step is empty here.
 * - S9's "Not Allowed" body text is not asserted: OPS ships no
 *   submission.wizard.notAllowed.description locale string, so the page
 *   renders a raw ##…## placeholder under its heading (new 🐞 candidate
 *   reported with this suite); the heading plus the withheld start form
 *   carry the control.
 *
 * Seeding: scenario endpoints only. Drafts (`submitted: false`) on the
 * read-only `publicknowledge` server for author-only flows; scratch servers
 * (with throwaway users carrying unique mail.test addresses) wherever a
 * setting is flipped, a section is mutated, or Mailpit is read (PRINCIPLES
 * A8 — every mail assertion is scoped by a unique throwaway recipient).
 * Scenario-12/5 sections and S5's second submission language ride the
 * context scenario's sections[] / supportedSubmissionLocales passthroughs
 * (the OPS sections override mirrors the OJS one; both reuse the bootstrap
 * seeder's section machinery). The restrict/deactivate flag flips stay on
 * the manager's Sections grid — they are scenario 12's own steps. All
 * tests run in the parallel `ops` project; nothing global is touched.
 */
const {test, expect} = require('../support/fixtures.js');
const {waitForJQueryIdle} = require('../support/legacy.js');
const {
    STEPS,
    SUBMIT_DIALOGS,
    startUrl,
    wizardUrl,
    footer,
    submittingToLine,
    railEntry,
    expectStep,
    expectWizardOpen,
    beginSubmission,
    continueTo,
    addGalleyFile,
    setRelationStatus,
    openReview,
    problemsBanner,
    reviewPanel,
    confirmSubmit,
    completeAndSubmitDraft,
    saveForLater,
    openChangeSettings,
} = require('../pages/SubmissionWizardPages.js');

const PK = 'publicknowledge';
const PK_PREFIX = '/en';

/** Parallel-safe unique tag: single alphanumeric token, ≤32 chars. */
function makeTag(testInfo, scenarioKey) {
    const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6);
    return `${scenarioKey}opsw${testInfo.parallelIndex}${rand}`;
}

/**
 * Seed a scratch preprint server whose path is the tag, with throwaway users
 * (usernames prefixed by the tag so their mail.test addresses are unique per
 * run). Returns {path, users: {key: {username, email}}}.
 */
async function seedServer(opsApi, tag, userKeys, {locales = null, submissionLocales = null, sections = null} = {}) {
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
    const context = {name: {en: `U21 Server ${tag}`}};
    if (locales) {
        context.supportedLocales = locales;
    }
    if (submissionLocales) {
        context.supportedSubmissionLocales = submissionLocales;
    }
    const spec = {tag, context, users: specs};
    if (sections) {
        spec.sections = sections;
    }
    await opsApi.createContext(spec);
    return {path: tag, users};
}

/** Seed a wizard-resumable draft; returns the scenario response. */
async function seedDraft(opsApi, tag, {context = PK, submitter = 'author.alex', ...rest} = {}) {
    return opsApi.createSubmission({
        tag,
        context,
        submitter,
        submitted: false,
        ...rest,
    });
}

/**
 * As the manager of a scratch server, tick or untick the workflow settings'
 * "Disable Submissions" box (Settings → Workflow → Submission).
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

/** Open Settings → Server → Sections (the legacy sections grid). */
async function gotoSections(page, contextPath) {
    await page.goto(`/index.php/${contextPath}/management/settings/context`);
    await page.getByRole('tab', {name: 'Sections'}).click();
    await waitForJQueryIdle(page);
    await expect(
        page.getByRole('link', {name: 'Create Section'})
    ).toBeVisible({timeout: 20_000});
}

/**
 * Click a legacy link/control until its AjaxModal answers — the jQuery
 * handlers (re)bind after grid refreshes, and a click that lands before
 * binding is silently lost.
 */
async function openLegacyModal(page, trigger, dialog) {
    await waitForJQueryIdle(page);
    for (let attempt = 0; ; attempt++) {
        await trigger.click();
        try {
            await expect(dialog.first()).toBeVisible({timeout: 5_000});
            return;
        } catch (error) {
            if (attempt >= 2) {
                throw error;
            }
        }
    }
}

/**
 * Restrict a section to editors via its grid row's Edit form (checkbox
 * name is OPS's `editorRestriction` — the OJS fork spells it
 * `editorRestricted`). Assumes gotoSections() ran.
 */
async function restrictSection(page, title) {
    const row = page.locator('tr').filter({hasText: title}).first();
    await row.locator('a.show_extras').click();
    const dialog = page
        .getByRole('dialog')
        .filter({has: page.locator('#sectionForm')});
    await openLegacyModal(page, page.getByRole('link', {name: 'Edit', exact: true}), dialog);
    await dialog.locator('input[name="editorRestriction"]').check();
    await dialog.getByRole('button', {name: 'Save', exact: true}).click();
    await expect(dialog).toHaveCount(0, {timeout: 20_000});
    await waitForJQueryIdle(page);
}

/**
 * Deactivate a section via its grid row's "Inactive" checkbox (confirm
 * dialog included). Assumes gotoSections() ran.
 */
async function deactivateSection(page, title) {
    const row = page.locator('tr').filter({hasText: title}).first();
    const checkbox = row.locator('input[type="checkbox"]');
    const confirm = page
        .getByRole('dialog')
        .filter({hasText: 'Are you sure you wish to deactivate this section?'});
    await openLegacyModal(page, checkbox, confirm);
    await confirm.getByRole('button', {name: 'OK', exact: true}).click();
    await waitForJQueryIdle(page);
    await expect(checkbox).toBeChecked({timeout: 20_000});
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
        // begin (scenario 1; publicknowledge has one open section and one
        // submission language, so neither choice renders — Rule 4).
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

    test('S2: fill every step and submit; the acknowledgement arrives', async ({opsApi, pkpMail, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s2');
        const server = await seedServer(opsApi, tag, ['author']);
        const author = server.users.author;
        const seeded = await seedDraft(opsApi, tag, {
            context: server.path,
            submitter: author.username,
        });

        const page = await (await asUser(author.username)).newPage();
        await page.goto(wizardUrl(server.path, seeded.submissionId));
        await expectWizardOpen(page);

        // Add a galley, pass every step (the required Relation status
        // included), submit from Review; the confirmation dialog says a
        // moderator will review the preprint (scenario 2 / OPS1).
        await completeAndSubmitDraft(page, {message: SUBMIT_DIALOGS.moderated});

        // The completion screen says the moderator will review the
        // submission and offers the three links (Rule 15 / OPS1).
        await expect(
            page.getByText('Once the moderator has reviewed your submission')
        ).toBeVisible();
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
        // author's own view (the preprint's publication tabs).
        await page.getByRole('link', {name: 'Review this submission'}).click();
        await expect(
            page
                .locator('[data-cy="active-modal"]')
                .locator('nav')
                .getByText('Title & Abstract')
        ).toBeVisible({timeout: 30_000});
    });

    test('S3: save for later and resume from the emailed link', async ({opsApi, pkpMail, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s3');
        const server = await seedServer(opsApi, tag, ['author']);
        const author = server.users.author;
        const seeded = await seedDraft(opsApi, tag, {
            context: server.path,
            submitter: author.username,
        });

        const page = await (await asUser(author.username)).newPage();
        await page.goto(wizardUrl(server.path, seeded.submissionId));
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

    test('S4: the manager cancels a draft; an assigned moderator gets no Cancel', async ({opsApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s4');
        // The draft carries an assigned Moderator (the scenario API's
        // participants[] key — the control's seeding, not the surface under
        // test).
        const seeded = await seedDraft(opsApi, tag, {
            participants: [{username: 'sectioneditor.ana', role: 'sectionEditor'}],
        });
        const draftUrl = wizardUrl(PK, seeded.submissionId, {localePrefix: PK_PREFIX});

        // Control: the assigned Moderator gets the wizard — Save for Later
        // and Continue offered — but no "Cancel" (Rule 16).
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

        // The manager cancels: warning dialog, then the "Submission
        // cancelled" screen (Rule 16; on a preprint server the scenario
        // passes only for a manager — the author's own Cancel is register
        // OPS3 and is not exercised here).
        const mayaPage = await (await asUser('manager.maya')).newPage();
        await mayaPage.goto(draftUrl);
        await expectWizardOpen(mayaPage);
        await mayaPage.locator('#cancelSubmission').click();
        const dialog = mayaPage
            .getByRole('dialog')
            .filter({hasText: 'Cancel submission'});
        await expect(
            dialog.getByText(
                'Are you sure you wish to cancel this submission? This will delete the submission and all associated data. This action cannot be undone.'
            )
        ).toBeVisible({timeout: 10_000});
        await dialog.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(
            mayaPage.getByRole('heading', {name: 'Submission cancelled'})
        ).toBeVisible({timeout: 30_000});
        await expect(mayaPage.getByRole('link', {name: 'Create a new submission'})).toBeVisible();
        await expect(mayaPage.getByRole('link', {name: 'Return to your dashboard'})).toBeVisible();

        // The deleted draft's wizard address now answers a bare 404.
        const response = await mayaPage.goto(draftUrl);
        expect(response.status()).toBe(404);
    });

    test('S5: change the submission settings midway (section and language)', async ({opsApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s5');
        // Two open sections and two submission languages, seeded through
        // the context scenario (sections[] + supportedSubmissionLocales).
        const server = await seedServer(opsApi, tag, ['author'], {
            locales: ['en', 'fr_CA'],
            submissionLocales: ['en', 'fr_CA'],
            sections: [
                {abbrev: 'PRE', title: {en: 'Preprints'}},
                {abbrev: 'SEC', title: {en: 'Second Section'}},
            ],
        });

        const seeded = await seedDraft(opsApi, tag, {
            context: server.path,
            submitter: server.users.author.username,
        });

        // With two open sections and two languages, the wizard states what
        // is being submitted, with a "Change" control (Rules 7, 11).
        const page = await (await asUser(server.users.author.username)).newPage();
        await page.goto(wizardUrl(server.path, seeded.submissionId));
        await expectWizardOpen(page);
        await expect(submittingToLine(page)).toContainText(
            'Submitting to the Preprints section in English.'
        );

        // "Change Submission Settings" offers the section and the language;
        // pick the other pair and save: the wizard reloads and the line
        // names the new section and language (scenario 5).
        const modal = await openChangeSettings(page);
        await expect(modal.getByRole('radio', {name: 'Preprints', exact: true})).toBeChecked();
        await modal.getByRole('radio', {name: 'Second Section', exact: true}).check();
        await modal.getByRole('radio', {name: 'French (Canada)', exact: true}).check();
        await modal.getByRole('button', {name: 'Save', exact: true}).click();
        await expect(submittingToLine(page)).toContainText(
            /Submitting to the Second Section section in French/,
            {timeout: 30_000}
        );
    });

    test('S6: validation blocks an empty submission until the file is fixed', async ({opsApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s6');
        const seeded = await seedDraft(opsApi, tag);

        const page = await (await asUser('author.alex')).newPage();
        await page.goto(wizardUrl(PK, seeded.submissionId, {localePrefix: PK_PREFIX}));
        await expectWizardOpen(page);

        // Straight to Review on "Continue" alone (scenario 6).
        await continueTo(page, STEPS.details);
        await continueTo(page, STEPS.contributors);
        await continueTo(page, STEPS.readers);
        await openReview(page);

        // The problems banner, the missing-galley complaint on the Files
        // panel, and a disabled Submit (Rules 12–14; the required file type
        // is the server's "Preprint Text" component — OPS1).
        await expect(problemsBanner(page)).toContainText(
            'There are one or more problems that need to be fixed before you can submit.'
        );
        const filesPanel = reviewPanel(page, 'Files');
        await expect(filesPanel).toContainText(
            /upload at least one Preprint Text file/
        );
        await expect(
            footer(page).getByRole('button', {name: 'Submit', exact: true})
        ).toBeDisabled();

        // The panel's "Edit" jumps back to Upload Files; fix the item and
        // return: the complaint is gone and Submit enables.
        await filesPanel.getByRole('button', {name: 'Edit', exact: true}).click();
        await expectStep(page, STEPS.files);
        await addGalleyFile(page);
        await openReview(page, {viaRail: true});
        await expect(problemsBanner(page)).toHaveCount(0);
        await expect(filesPanel).not.toContainText(
            /upload at least one Preprint Text file/
        );
        await expect(
            footer(page).getByRole('button', {name: 'Submit', exact: true})
        ).toBeEnabled();
    });

    test('S7: the server stops accepting submissions', async ({opsApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s7');
        const server = await seedServer(opsApi, tag, ['manager', 'author']);

        // Positive control: with submissions open, the author's sidebar
        // offers the entry (Rule 1).
        const authorPage = await (await asUser(server.users.author.username)).newPage();
        await authorPage.goto(`/index.php/${server.path}/dashboard/mySubmissions`);
        await expect(
            authorPage.getByRole('link', {name: 'Start A New Submission'})
        ).toBeVisible({timeout: 20_000});

        // The manager disables submissions (Rule 2).
        const managerPage = await (await asUser(server.users.manager.username)).newPage();
        await setDisableSubmissions(managerPage, server.path, true);

        // The sidebar entry disappears, and the typed start address shows
        // only the not-accepting notice (scenario 7; wording per A3 as
        // shown — server-worded on OPS).
        await authorPage.goto(`/index.php/${server.path}/dashboard/mySubmissions`);
        await expect(
            authorPage.getByRole('link', {name: 'Start A New Submission'})
        ).toHaveCount(0);
        await authorPage.goto(startUrl(server.path));
        await expect(
            authorPage.getByText(
                'This server is not accepting submissions at this time. Visit the workflow settings to allow submissions.'
            )
        ).toBeVisible({timeout: 20_000});
        await expect(
            authorPage.getByRole('button', {name: 'Begin Submission'})
        ).toHaveCount(0);

        // Positive control: re-enabling brings the sidebar entry back.
        await setDisableSubmissions(managerPage, server.path, false);
        await authorPage.goto(`/index.php/${server.path}/dashboard/mySubmissions`);
        await expect(
            authorPage.getByRole('link', {name: 'Start A New Submission'})
        ).toBeVisible({timeout: 20_000});
    });

    test('S8: a draft outlives the closing and still submits', async ({opsApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s8');
        const server = await seedServer(opsApi, tag, ['manager', 'author']);
        const seeded = await seedDraft(opsApi, tag, {
            context: server.path,
            submitter: server.users.author.username,
        });

        // The manager closes submissions after the draft was started.
        const managerPage = await (await asUser(server.users.manager.username)).newPage();
        await setDisableSubmissions(managerPage, server.path, true);

        // The author's draft still opens as the normal wizard, and
        // completing it still submits (scenario 8 — as-built, ⚠ A1 open on
        // intent).
        const page = await (await asUser(server.users.author.username)).newPage();
        await page.goto(wizardUrl(server.path, seeded.submissionId));
        await expectWizardOpen(page);
        await expect(
            page.getByText('This server is not accepting submissions at this time', {
                exact: false,
            })
        ).toHaveCount(0);
        await completeAndSubmitDraft(page);
    });

    test('S9: a user with no submitting role is enrolled as Author; without self-registration the start screen refuses', async ({opsApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s9');
        const server = await seedServer(opsApi, tag, ['manager', 'reader', 'reader2']);

        // The bare reader holds no Author role yet: the profile's Roles tab
        // shows the self-registration "Author" box unchecked. (Checked
        // before any visit to the start screen — the enrolment timing
        // itself is register OPS2 and is not asserted.)
        const readerPage = await (await asUser(server.users.reader.username)).newPage();
        await readerPage.goto(`/index.php/${server.path}/user/profile`);
        await readerPage.getByRole('tab', {name: 'Roles'}).click();
        // Other servers' role checkboxes sit collapsed in the tab's
        // "other contexts" drawer (#userGroupExtraFormFields) — this
        // server's own Author box is the one outside it.
        const authorBox = readerPage.locator(
            'xpath=//form[@id="rolesForm"]//input[starts-with(@name, "authorGroup") and not(ancestor::div[@id="userGroupExtraFormFields"])]'
        );
        await expect(authorBox).toBeVisible({timeout: 20_000});
        await expect(authorBox).not.toBeChecked();

        // The start screen admits them and the wizard opens normally
        // (Rule 3, scenario 9).
        await readerPage.goto(startUrl(server.path));
        await beginSubmission(readerPage, {title: `Submission ${tag}`});

        // Afterwards the account holds the server's Author role.
        await readerPage.goto(`/index.php/${server.path}/user/profile`);
        await readerPage.getByRole('tab', {name: 'Roles'}).click();
        await expect(
            readerPage.locator(
                'xpath=//form[@id="rolesForm"]//input[starts-with(@name, "authorGroup") and not(ancestor::div[@id="userGroupExtraFormFields"])]'
            )
        ).toBeChecked({timeout: 20_000});

        // Control: the manager turns off the Author role's
        // self-registration; a second bare reader now gets "Not Allowed".
        const managerPage = await (await asUser(server.users.manager.username)).newPage();
        await managerPage.goto(`/index.php/${server.path}/management/settings/access`);
        await managerPage.locator('#roles-button').click();
        const authorRow = managerPage.locator('tr.gridRow').filter({
            has: managerPage.getByText('Author', {exact: true}),
        });
        await authorRow.locator('a.show_extras').click();
        await managerPage.getByRole('link', {name: 'Edit', exact: true}).click();
        const selfReg = managerPage.getByLabel('Allow user self-registration');
        await expect(selfReg).toBeVisible({timeout: 20_000});
        await selfReg.uncheck();
        await managerPage.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(selfReg).toBeHidden({timeout: 20_000});

        const reader2Page = await (await asUser(server.users.reader2.username)).newPage();
        await reader2Page.goto(startUrl(server.path));
        await expect(
            reader2Page.getByRole('heading', {name: 'Not Allowed'})
        ).toBeVisible({timeout: 20_000});
        // The page's body text is NOT asserted: OPS ships no
        // submission.wizard.notAllowed.description locale string, so the
        // explanation renders as a raw ##…## placeholder (register
        // candidate reported with this suite — a 🐞 is never asserted as
        // contract). The start form staying withheld is the control.
        await expect(
            reader2Page.getByRole('button', {name: 'Begin Submission'})
        ).toHaveCount(0);
    });

    test('S10: all contributors are acknowledged', async ({opsApi, pkpMail, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s10');
        const server = await seedServer(opsApi, tag, ['author']);
        const author = server.users.author;
        const contributorEmail = `${tag}contrib@mail.test`;
        const seeded = await seedDraft(opsApi, tag, {
            context: server.path,
            submitter: author.username,
        });

        const page = await (await asUser(author.username)).newPage();
        await page.goto(wizardUrl(server.path, seeded.submissionId));
        await expectWizardOpen(page);
        await addGalleyFile(page);
        await continueTo(page, STEPS.details);
        await continueTo(page, STEPS.contributors);

        // Add a second contributor with a distinct throwaway address
        // (scenario 10; the panel's own mechanics belong to Contributors &
        // affiliations).
        await page.getByRole('button', {name: 'Add Contributor'}).click();
        const modal = page.locator('[data-cy="active-modal"]').last();
        // Required fields' accessible names carry the "* Required" suffix.
        await modal
            .getByRole('textbox', {name: /^Given Name/})
            .first()
            .fill(`Coauthor${tag}`);
        await modal.getByRole('textbox', {name: /^Email/}).fill(contributorEmail);
        await modal
            .getByRole('combobox', {name: /^Country/})
            .selectOption({label: 'Iceland'});
        // The server offers more than one contributor role, so the required
        // Contributor Roles choice renders — tick "Author".
        await modal
            .getByRole('group', {name: /Contributor Roles/})
            .getByRole('checkbox', {name: 'Author', exact: true})
            .check();
        const saved = page.waitForResponse(
            (r) => r.url().includes('/contributors') && r.ok()
        );
        await modal.getByRole('button', {name: 'Save', exact: true}).click();
        await saved;
        await expect(page.getByText(`Coauthor${tag}`).first()).toBeVisible({
            timeout: 20_000,
        });

        await continueTo(page, STEPS.readers);
        await setRelationStatus(page);
        await openReview(page);
        await expect(problemsBanner(page)).toHaveCount(0);
        await confirmSubmit(page);

        // Two acknowledgements: the submitting author's, and the co-author
        // variant to the other contributor (Side effects; a fresh server
        // defaults to "all authors").
        await pkpMail.find({
            to: author.email,
            subject: 'Thank you for your submission',
            timeoutMs: 30_000,
        });
        // OPS's seeded co-author template titles this one "Submission
        // Acknowledgement" (OJS's reads "Submission confirmation") — the
        // body is the you-have-been-named-as-a-co-author variant.
        await pkpMail.find({
            to: contributorEmail,
            subject: 'Submission Acknowledgement',
            contains: 'named as a co-author',
            timeoutMs: 30_000,
        });
    });

    test('S11: moderators learn of the new submission', async ({opsApi, pkpMail, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s11');

        // First half — a submission into the seeded server's section, whose
        // configured moderators are auto-assigned (the base server is the
        // install's oldest context, where assignment works — ⚠ A8 elsewhere;
        // the assignment email itself belongs to Stage participants).
        const assigned = await opsApi.createSubmission({
            tag: `${tag}a`,
            context: PK,
            submitter: 'author.alex',
        });
        const mayaPage = await (await asUser('manager.maya')).newPage();
        await mayaPage.goto(
            `/index.php/${PK}${PK_PREFIX}/dashboard/editorial?workflowSubmissionId=${assigned.submissionId}`
        );
        const workflow = mayaPage.locator('[data-cy="active-modal"]').first();
        await expect(
            workflow.getByRole('heading', {name: /^Workflow:/}).first()
        ).toBeVisible({timeout: 20_000});
        const participants = workflow.locator('[data-cy="workflow-secondary-items"]');
        await expect(participants.getByText('Ana Section Editor')).toBeVisible({
            timeout: 20_000,
        });
        await expect(participants.getByText('Ravi Section Editor')).toBeVisible();

        // Second half — a scratch server whose section has no moderators:
        // every manager gets the needs-an-editor email and a task
        // notification (Side effects; unique throwaway recipient).
        const server = await seedServer(opsApi, tag, ['manager', 'author']);
        const draft = await seedDraft(opsApi, tag, {
            context: server.path,
            submitter: server.users.author.username,
        });
        const authorPage = await (await asUser(server.users.author.username)).newPage();
        await authorPage.goto(wizardUrl(server.path, draft.submissionId));
        await expectWizardOpen(authorPage);
        await completeAndSubmitDraft(authorPage);

        await pkpMail.find({
            to: server.users.manager.email,
            subject: 'needs an editor to be assigned',
            contains: tag,
            timeoutMs: 30_000,
        });

        const managerPage = await (await asUser(server.users.manager.username)).newPage();
        await managerPage.goto(`/index.php/${server.path}/dashboard/editorial`);
        await managerPage.getByRole('button', {name: /^Tasks/}).first().click();
        const tasks = managerPage.locator('[data-cy="active-modal"]').last();
        await expect(tasks.getByRole('table').first()).toBeVisible({timeout: 20_000});
        await expect(
            tasks
                .getByText(
                    'A new preprint has been submitted to which a moderator needs to be assigned.'
                )
                .first()
        ).toBeVisible({timeout: 20_000});
    });

    test('S12: closed and restricted sections gate intake and block a draft', async ({opsApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s12');
        const server = await seedServer(opsApi, tag, ['manager', 'author'], {
            sections: [
                {abbrev: 'ALP', title: {en: 'Alpha'}},
                {abbrev: 'OPN', title: {en: 'Open Extra'}},
                {abbrev: 'EDO', title: {en: 'Editors Only'}},
                {abbrev: 'DOO', title: {en: 'Doomed'}},
            ],
        });
        // A draft in the section that will be deactivated.
        const seeded = await seedDraft(opsApi, tag, {
            context: server.path,
            submitter: server.users.author.username,
            section: 'DOO',
        });

        // The manager restricts one section to editors and deactivates
        // another (scenario 12, through the sections grid).
        const managerPage = await (await asUser(server.users.manager.username)).newPage();
        await gotoSections(managerPage, server.path);
        await restrictSection(managerPage, 'Editors Only');
        await deactivateSection(managerPage, 'Doomed');

        // The author's start form offers only the open sections — neither
        // the restricted nor the deactivated one (Rule 3).
        const authorPage = await (await asUser(server.users.author.username)).newPage();
        await authorPage.goto(startUrl(server.path));
        await expect(
            authorPage.getByRole('radio', {name: 'Alpha', exact: true})
        ).toBeVisible({timeout: 20_000});
        await expect(
            authorPage.getByRole('radio', {name: 'Open Extra', exact: true})
        ).toBeVisible();
        await expect(
            authorPage.getByRole('radio', {name: 'Editors Only', exact: true})
        ).toHaveCount(0);
        await expect(
            authorPage.getByRole('radio', {name: 'Doomed', exact: true})
        ).toHaveCount(0);

        // The manager is additionally offered the restricted section — but
        // not the deactivated one (Rule 3).
        await managerPage.goto(startUrl(server.path));
        await expect(
            managerPage.getByRole('radio', {name: 'Editors Only', exact: true})
        ).toBeVisible({timeout: 20_000});
        await expect(
            managerPage.getByRole('radio', {name: 'Doomed', exact: true})
        ).toHaveCount(0);

        // The author reopening the draft in the deactivated section gets
        // the "Section Closed" page naming the section and the server's
        // contact (Rule 17).
        await authorPage.goto(wizardUrl(server.path, seeded.submissionId));
        await expect(
            authorPage.getByRole('heading', {name: 'Section Closed'})
        ).toBeVisible({timeout: 20_000});
        await expect(
            authorPage.getByText(/is not accepting submissions to the Doomed section/)
        ).toBeVisible();
        await expect(authorPage.getByRole('link', {name: 'Site Admin'})).toBeVisible();
    });

    test('S13+S14 (absence): no Reviewer Suggestions step, no Submission Type, no reader-site block', async ({opsApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s13');
        const page = await (await asUser('author.alex')).newPage();

        // The start form intakes by section, never by Submission Type
        // (scenario 14 is press-only — OMP1); positive control: the form
        // itself rendered.
        await page.goto(startUrl(PK, {localePrefix: PK_PREFIX}));
        await expect(
            page.getByRole('button', {name: 'Begin Submission'})
        ).toBeVisible({timeout: 20_000});
        await expect(page.getByText('Submission Type')).toHaveCount(0);

        // A draft's wizard shows exactly the five OPS steps — no Reviewer
        // Suggestions step, ever (scenario 13's stated OPS control; OPS1).
        const seeded = await seedDraft(opsApi, tag);
        await page.goto(wizardUrl(PK, seeded.submissionId, {localePrefix: PK_PREFIX}));
        await expectWizardOpen(page);
        const labels = await page
            .locator('.pkpSteps__buttons .pkpSteps__step__label')
            .allInnerTexts();
        expect(labels.map((label) => label.trim().replace(/^\d+\s*/, ''))).toEqual([
            STEPS.files,
            STEPS.details,
            STEPS.contributors,
            STEPS.readers,
            STEPS.review,
        ]);
        await expect(railEntry(page, STEPS.reviewerSuggestions)).toHaveCount(0);

        // The workflow settings offer no Review tab to enable suggestions
        // from (the setting lives in review settings OPS does not install);
        // positive control: the Submission tab is there.
        const mayaPage = await (await asUser('manager.maya')).newPage();
        await mayaPage.goto(`/index.php/${PK}/management/settings/workflow`);
        await expect(
            mayaPage.getByRole('tab', {name: 'Submission', exact: true})
        ).toBeVisible({timeout: 20_000});
        await expect(mayaPage.getByRole('tab', {name: 'Review', exact: true})).toHaveCount(0);

        // The reader-site "Make a Submission" block is not installed on a
        // preprint server (Rule 1); positive control: the plugin list shows
        // its other block plugins.
        await mayaPage.goto(`/index.php/${PK}/management/settings/website`);
        await mayaPage.getByRole('tab', {name: 'Plugins', exact: true}).first().click();
        const pluginsPanel = mayaPage.getByRole('tabpanel', {name: 'Plugins'}).first();
        await expect(
            pluginsPanel.getByText('Language Toggle Block').first()
        ).toBeVisible({timeout: 20_000});
        await expect(pluginsPanel.getByText(/Make a Submission.*Block/)).toHaveCount(0);
    });

    test('S15: the preprint wizard is galley-based; a can-post submitter gets the post-it variant', async ({opsApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u21s15');
        const server = await seedServer(opsApi, tag, ['manager']);
        const manager = server.users.manager;
        const seeded = await seedDraft(opsApi, tag, {
            context: server.path,
            submitter: manager.username,
        });

        const page = await (await asUser(manager.username)).newPage();
        await page.goto(wizardUrl(server.path, seeded.submissionId));
        await expectWizardOpen(page);

        // The galley flow: "Add File" asks for the Galley Label first, then
        // the upload demands the Preprint Component (scenario 15 / OPS1).
        await addGalleyFile(page, {label: 'PDF'});

        // The fourth step is "For Readers": a License choice, the required
        // "Relation status" question, and "Comments for the Moderator".
        await continueTo(page, STEPS.details);
        await continueTo(page, STEPS.contributors);
        await continueTo(page, STEPS.readers);
        await expect(page.getByRole('heading', {name: 'License', exact: true})).toBeVisible();
        await expect(page.getByRole('radio', {name: 'CC Attribution 4.0', exact: true})).toBeVisible();
        const relationGroup = page.getByRole('group', {name: /Relation status/});
        await expect(relationGroup).toBeVisible();
        await expect(relationGroup).toContainText('Required');
        await expect(
            page.locator('label').filter({hasText: 'Comments for the Moderator'})
        ).toBeVisible();
        await setRelationStatus(page);

        // Review lists the galley under its "Files" panel with its label
        // and component (OPS1).
        await openReview(page);
        await expect(problemsBanner(page)).toHaveCount(0);
        const filesPanel = reviewPanel(page, 'Files');
        await expect(filesPanel.getByRole('link', {name: 'PDF'}).first()).toBeVisible();
        await expect(filesPanel).toContainText('Preprint Text');

        // Control — a submitter who may post their own preprint: the
        // confirmation dialog and the completion screen carry the can-post
        // variant (OPS1; no mail assertion here — register OPS5).
        await confirmSubmit(page, {message: SUBMIT_DIALOGS.canPost});
        await expect(
            page.getByText('Thank you for submitting your preprint. You can now')
        ).toBeVisible();
        await expect(page.getByRole('link', {name: 'post your preprint'})).toBeVisible();
    });
});
