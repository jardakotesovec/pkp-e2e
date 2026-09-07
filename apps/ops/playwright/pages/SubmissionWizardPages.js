// @ts-check
/**
 * @file playwright/pages/SubmissionWizardPages.js
 *
 * App-local helpers for the OPS submission wizard suite (U21). Screen shapes
 * from lib/pkp/templates/submission/{start,wizard,complete,saved,cancelled}.tpl
 * + ui-library SubmissionWizardPage[OPS].vue, verified against the running
 * OPS fleet. The steps rail renders started steps as buttons
 * (.pkpSteps__step__label, --current on the open one) and unreached steps as
 * plain spans; the footer's primary button reads "Continue" until the last
 * step, where it reads "Submit".
 *
 * OPS divergences from the OMP twin (register OPS1): the Upload Files step
 * manages the preprint's galleys through the legacy "Files" grid — "Add File"
 * asks for a Galley Label, then the legacy upload wizard demands a Preprint
 * Component before accepting the file; the fourth step is "For Readers"; the
 * submit-confirmation dialog branches on whether the user may post.
 */
const path = require('path');
const {expect} = require('../support/fixtures.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

/** Default upload fixture (app-local). */
const FIXTURE_PDF = path.join(__dirname, '..', 'fixtures', 'files', 'preprint.pdf');

/** The preprint server wizard's step rail labels, in order. */
const STEPS = {
    files: 'Upload Files',
    details: 'Details',
    contributors: 'Contributors',
    readers: 'For Readers',
    reviewerSuggestions: 'Reviewer Suggestions', // never renders on OPS (OPS1)
    review: 'Review',
};

/** The submit-confirmation dialog's two OPS variants (Rule 14 / OPS1). */
const SUBMIT_DIALOGS = {
    moderated: /a moderator will review the preprint before posting it online/,
    canPost: /you will be able to review your submission and post it online/,
};

function startUrl(contextPath, {localePrefix = ''} = {}) {
    return `/index.php/${contextPath}${localePrefix}/submission`;
}

function wizardUrl(contextPath, submissionId, {localePrefix = ''} = {}) {
    return `/index.php/${contextPath}${localePrefix}/submission?id=${submissionId}`;
}

/** The wizard footer button row. */
function footer(page) {
    return page.locator('.submissionWizard__footer');
}

/** The "Submitting to the {section} section… Change" configuration line. */
function submittingToLine(page) {
    return page.locator('#submission-configuration');
}

/** A step's rail entry (started steps are buttons; unreached ones spans). */
function railEntry(page, label) {
    return page
        .locator('.pkpSteps__buttons .pkpSteps__step__label')
        .filter({hasText: label});
}

/** The rail's current-step button. */
function currentRailStep(page) {
    return page.locator('.pkpSteps__step__label--current');
}

/** Assert the rail's current step by its visible label. */
async function expectStep(page, label) {
    await expect(currentRailStep(page)).toContainText(label, {timeout: 20_000});
}

/** Wait for the wizard screen itself (heading + rail). */
async function expectWizardOpen(page) {
    await expect(
        page.getByRole('heading', {name: /Make a Submission/}).first()
    ).toBeVisible({timeout: 20_000});
    await expect(page.locator('.pkpSteps__buttons')).toBeVisible();
}

/**
 * Fill the start form's one-line rich-text Title (TinyMCE renders an iframe;
 * the start screen has exactly one).
 */
async function fillStartTitle(page, title) {
    const body = page
        .frameLocator('iframe.tox-edit-area__iframe')
        .first()
        .locator('body');
    await body.click();
    await body.fill(title);
    await expect(body).toContainText(title);
}

/**
 * Complete the "Make a Submission" start form and press "Begin Submission".
 * Ticks whatever confirmation boxes the form offers; picks a section and/or
 * submission language when a label is given (both radios render only when
 * the server offers a choice — Rule 4). Resolves once the wizard has opened.
 */
async function beginSubmission(page, {title, section = null, language = null}) {
    await expect(
        page.getByRole('heading', {name: /Make a Submission/}).first()
    ).toBeVisible({timeout: 20_000});
    await fillStartTitle(page, title);
    if (language) {
        await page.getByRole('radio', {name: language, exact: true}).check();
    }
    if (section) {
        await page.getByRole('radio', {name: section, exact: true}).check();
    }
    const requirements = page.getByRole('checkbox', {
        name: /meets all of these requirements/,
    });
    if (await requirements.count()) {
        await requirements.check();
    }
    const privacy = page.getByRole('checkbox', {
        name: /agree to have my data collected/,
    });
    if (await privacy.count()) {
        await privacy.check();
    }
    await page.getByRole('button', {name: 'Begin Submission'}).click();
    await page.waitForURL(/[?&]id=\d+/, {waitUntil: 'commit', timeout: 30_000});
    await expectWizardOpen(page);
    await expectStep(page, STEPS.files);
}

/**
 * Advance one step with the footer's "Continue" and wait for arrival. The
 * footer re-renders when an autosave starts, which can swallow a click
 * (patterns.md, wizard steps rail) — so the click is retried when the rail
 * has not moved.
 */
async function continueTo(page, label) {
    const button = footer(page).getByRole('button', {name: 'Continue', exact: true});
    for (let attempt = 0; ; attempt++) {
        await button.click();
        try {
            await expect(currentRailStep(page)).toContainText(label, {timeout: 5_000});
            return;
        } catch (error) {
            if (attempt >= 2) {
                throw error;
            }
        }
    }
}

/**
 * Add a galley on the Upload Files step (OPS1): "Add File" asks for the
 * Galley Label; saving it auto-opens the legacy upload wizard, which demands
 * the file's Preprint Component before accepting the upload.
 */
async function addGalleyFile(page, {label = 'PDF', genre = 'Preprint Text', file = FIXTURE_PDF} = {}) {
    const labelDialog = page
        .getByRole('dialog')
        .filter({has: page.locator('#preprintGalleyForm')});
    // The grid's jQuery handlers (re)bind after refreshes — retry a click
    // that lands before binding and is silently lost.
    await waitForJQueryIdle(page);
    for (let attempt = 0; ; attempt++) {
        await page.getByRole('link', {name: 'Add File', exact: true}).click();
        try {
            await expect(labelDialog.first()).toBeVisible({timeout: 5_000});
            break;
        } catch (error) {
            if (attempt >= 2) {
                throw error;
            }
        }
    }
    // fbv ids are runtime-suffixed — select by name (patterns.md locator pitfall "fbvElement ids are runtime-suffixed").
    await labelDialog.locator('input[name="label"]').fill(label);
    await labelDialog.getByRole('button', {name: 'Save', exact: true}).click();

    const upload = page
        .getByRole('dialog')
        .filter({has: page.locator('div[id^="fileUploadWizard"]')});
    const genreSelect = upload.locator('select[name="genreId"]').first();
    await expect(genreSelect).toBeVisible({timeout: 30_000});
    await genreSelect.selectOption({label: genre});
    await upload.locator('input[type="file"]').setInputFiles(file);
    const continueButton = upload.getByRole('button', {name: 'Continue', exact: true});
    await expect(continueButton).toBeEnabled({timeout: 30_000});
    await continueButton.click();
    await expect(upload.getByRole('tab', {name: '2. Review Details'})).toHaveAttribute(
        'aria-selected',
        'true',
        {timeout: 30_000}
    );
    await upload.getByRole('button', {name: 'Continue', exact: true}).click();
    await expect(upload.getByRole('tab', {name: '3. Confirm'})).toHaveAttribute(
        'aria-selected',
        'true',
        {timeout: 30_000}
    );
    await upload.getByRole('button', {name: 'Complete', exact: true}).click();
    await expect(upload).toHaveCount(0, {timeout: 30_000});
    await waitForJQueryIdle(page);
    // The step's "Files" grid lists the new galley by its label.
    await expect(
        page.locator('.submissionWizard').getByRole('link', {name: label}).first()
    ).toBeVisible({timeout: 20_000});
}

/** Answer the For Readers step's required "Relation status" question. */
async function setRelationStatus(
    page,
    label = 'This preprint has not been published elsewhere.'
) {
    await page.getByRole('radio', {name: label}).check();
}

/**
 * Open the Review step (via Continue or the rail) and wait for the
 * submission check to answer — the check runs every time Review opens.
 */
async function openReview(page, {viaRail = false} = {}) {
    const validated = page.waitForResponse(
        (r) =>
            r.url().includes('/submit') &&
            r.request().method() === 'POST' &&
            r.status() < 500
    );
    const target = viaRail
        ? railEntry(page, STEPS.review)
        : footer(page).getByRole('button', {name: 'Continue', exact: true});
    for (let attempt = 0; ; attempt++) {
        await target.click();
        try {
            await expect(currentRailStep(page)).toContainText(STEPS.review, {
                timeout: 5_000,
            });
            break;
        } catch (error) {
            if (attempt >= 2) {
                throw error;
            }
        }
    }
    await validated;
    await expect(page.locator('.submissionWizard__loadingReview')).toHaveCount(0, {
        timeout: 20_000,
    });
}

/** The Review step's problems banner. */
function problemsBanner(page) {
    return page.locator('.submissionWizard__review_errors');
}

/** A Review-step summary panel by its heading ("Files", "Details", …). */
function reviewPanel(page, heading) {
    return page
        .locator('.submissionWizard__reviewPanel')
        .filter({has: page.getByRole('heading', {name: heading, exact: true})});
}

/**
 * On the Review step, press Submit, assert the confirmation dialog carries
 * the expected OPS variant message (SUBMIT_DIALOGS), confirm, and wait for
 * the "Submission complete" screen.
 */
async function confirmSubmit(page, {message = SUBMIT_DIALOGS.moderated} = {}) {
    const submit = footer(page).getByRole('button', {name: 'Submit', exact: true});
    await expect(submit).toBeEnabled({timeout: 20_000});
    await submit.click();
    const dialog = page
        .getByRole('dialog')
        .filter({hasText: 'Are you sure you want to submit'});
    await expect(dialog).toBeVisible({timeout: 10_000});
    await expect(dialog).toContainText(message);
    await dialog.getByRole('button', {name: 'Submit', exact: true}).click();
    await expect(
        page.getByRole('heading', {name: 'Submission complete'})
    ).toBeVisible({timeout: 30_000});
}

/**
 * Walk a fresh draft (open on its first step) to a completed submission:
 * add a galley, pass every step, answer the required Relation status, and
 * submit from Review. Returns after the "Submission complete" screen appears.
 */
async function completeAndSubmitDraft(page, {label = 'PDF', message = SUBMIT_DIALOGS.moderated} = {}) {
    await expectStep(page, STEPS.files);
    await addGalleyFile(page, {label});
    await continueTo(page, STEPS.details);
    await continueTo(page, STEPS.contributors);
    await continueTo(page, STEPS.readers);
    await setRelationStatus(page);
    await openReview(page);
    await expect(problemsBanner(page)).toHaveCount(0);
    await confirmSubmit(page, {message});
}

/** Press "Save for Later" (footer) and wait for the Saved for Later screen. */
async function saveForLater(page) {
    await footer(page)
        .getByRole('button', {name: 'Save for Later', exact: true})
        .last()
        .click();
    await expect(
        page.getByRole('heading', {name: 'Saved for Later'})
    ).toBeVisible({timeout: 30_000});
}

/** Open the "Change Submission Settings" panel from the header line. */
async function openChangeSettings(page) {
    await submittingToLine(page).getByRole('button', {name: 'Change'}).click();
    const modal = page.locator('[data-cy="active-modal"]').last();
    await expect(
        modal.getByText('Change Submission Settings').first()
    ).toBeVisible({timeout: 10_000});
    return modal;
}

/** The footer's primary "Submit" button (Review step). */
function submitButton(page) {
    return footer(page).getByRole('button', {name: 'Submit', exact: true});
}

/**
 * The Review step's closing "Confirmation" section heading — present only
 * when the server has a copyright notice (Rule 12).
 */
function confirmationHeading(page) {
    return page.getByRole('heading', {name: 'Confirmation', exact: true});
}

/** The Confirmation section's copyright box (Rule 14). */
function copyrightCheckbox(page) {
    return page.getByRole('checkbox', {name: /agree to the copyright statement/});
}

/**
 * Wizard form control ids (TinyMCE renders `{id}_ifr`). The For Readers
 * step's "Comments for the Moderator" box is not multilingual, so it
 * carries no locale suffix (probe `.reports/U21/tops/readers-iframes-ops.json`).
 */
const CONTROLS = {
    title: 'titleAbstract-title-control-en',
    abstract: 'titleAbstract-abstract-control-en',
    keywords: 'titleAbstract-keywords-control-en',
    moderatorNote: 'commentsForTheEditors-commentsForTheEditors-control',
};

/** Fill a wizard TinyMCE box by its control id (replaces its content). */
async function fillRichText(page, controlId, text) {
    const body = page.frameLocator(`#${controlId}_ifr`).locator('body');
    await body.click();
    await body.fill(text);
    await expect(body).toContainText(text);
}

/** The rendered text of a wizard TinyMCE box. */
function richTextBody(page, controlId) {
    return page.frameLocator(`#${controlId}_ifr`).locator('body');
}

/** A Details / For Readers form field by its label. */
function wizardField(page, labelRe) {
    return page
        .locator('.pkpFormField')
        .filter({has: page.locator('label.pkpFormFieldLabel').filter({hasText: labelRe})});
}

/** Add a keyword chip on the Details step (Enter commits the term). */
async function addKeyword(page, term) {
    const input = page.locator(`#${CONTROLS.keywords}`);
    await input.click();
    await input.fill(term);
    await input.press('Enter');
    await expect(page.getByRole('button', {name: `Remove ${term}`})).toBeVisible();
}

/** The Contributors step's list rows. */
function contributorRows(page) {
    return page.locator('.listPanel--contributor li.listPanel__item');
}

/**
 * On the Contributors step, add a person contributor with the Author role
 * (the panel's own mechanics belong to Contributors & affiliations). The
 * server offers more than one contributor role, so the required
 * "Contributor Roles" choice renders. Waits for the save and for the row.
 */
async function addContributor(page, {givenName, email, country = 'Iceland'}) {
    await page.getByRole('button', {name: 'Add Contributor'}).click();
    const modal = page.locator('[data-cy="active-modal"]').last();
    // Required fields' accessible names carry the "* Required" suffix.
    await modal.getByRole('textbox', {name: /^Given Name/}).first().fill(givenName);
    await modal.getByRole('textbox', {name: /^Email/}).fill(email);
    await modal.getByRole('combobox', {name: /^Country/}).selectOption({label: country});
    await modal
        .getByRole('group', {name: /Contributor Roles/})
        .getByRole('checkbox', {name: 'Author', exact: true})
        .check();
    const saved = page.waitForResponse(
        (r) => r.url().includes('/contributors') && r.request().method() === 'POST' && r.ok()
    );
    await modal.getByRole('button', {name: 'Save', exact: true}).click();
    await saved;
    await expect(contributorRows(page).filter({hasText: givenName})).toBeVisible({timeout: 20_000});
}

/**
 * Press the footer's "Cancel", confirm the "Cancel submission" dialog with
 * "OK", and wait for the "Submission cancelled" screen (Rule 16; on a
 * preprint server this completes for a manager only — register OPS3).
 */
async function cancelDraft(page) {
    await page.locator('#cancelSubmission').click();
    const dialog = page.getByRole('dialog').filter({hasText: 'Cancel submission'});
    await expect(
        dialog.getByText(
            'Are you sure you wish to cancel this submission? This will delete the submission and all associated data. This action cannot be undone.'
        )
    ).toBeVisible({timeout: 10_000});
    await dialog.getByRole('button', {name: 'OK', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Submission cancelled'})).toBeVisible({
        timeout: 30_000,
    });
}

module.exports = {
    FIXTURE_PDF,
    STEPS,
    SUBMIT_DIALOGS,
    CONTROLS,
    startUrl,
    wizardUrl,
    footer,
    submitButton,
    submittingToLine,
    railEntry,
    currentRailStep,
    expectStep,
    expectWizardOpen,
    fillStartTitle,
    beginSubmission,
    continueTo,
    addGalleyFile,
    setRelationStatus,
    openReview,
    problemsBanner,
    reviewPanel,
    confirmationHeading,
    copyrightCheckbox,
    fillRichText,
    richTextBody,
    wizardField,
    addKeyword,
    contributorRows,
    addContributor,
    confirmSubmit,
    completeAndSubmitDraft,
    saveForLater,
    cancelDraft,
    openChangeSettings,
};
