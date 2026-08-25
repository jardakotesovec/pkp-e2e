// @ts-check
/**
 * @file playwright/pages/SubmissionWizardPages.js
 *
 * App-local helpers for the OMP submission wizard suite (U21). Screen shapes
 * from lib/pkp/templates/submission/{start,wizard,complete,saved,cancelled}.tpl
 * + ui-library SubmissionWizardPage[OMP].vue, verified against the running
 * OMP fleet. The steps rail renders started steps as buttons
 * (.pkpSteps__step__label, --current on the open one) and unreached steps as
 * plain spans; the footer's primary button reads "Continue" until the last
 * step, where it reads "Submit".
 */
const {expect} = require('../support/fixtures.js');

/** The press wizard's step rail labels, in order (no reviewer suggestions). */
const STEPS = {
    files: 'Upload Files',
    details: 'Details',
    contributors: 'Contributors',
    editors: 'For the Editors',
    reviewerSuggestions: 'Reviewer Suggestions',
    review: 'Review',
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

/** The "Submitting a Monograph. Change" configuration line. */
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
 * Ticks whatever confirmation boxes the form offers; picks the work type
 * when a label regex is given (Monograph arrives preselected). Resolves once
 * the wizard has opened.
 */
async function beginSubmission(page, {title, workType = null}) {
    await expect(
        page.getByRole('heading', {name: /Make a Submission/}).first()
    ).toBeVisible({timeout: 20_000});
    await fillStartTitle(page, title);
    if (workType) {
        await page.getByRole('radio', {name: workType}).check();
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

/** Advance one step with the footer's "Continue" and wait for arrival. */
async function continueTo(page, label) {
    await footer(page).getByRole('button', {name: 'Continue', exact: true}).click();
    await expectStep(page, label);
}

/**
 * Upload a file on the Upload Files step through the panel's hidden file
 * input, then answer the file-type prompt with the given genre button.
 */
async function uploadWizardFile(page, fileName, {genre = 'Book Manuscript'} = {}) {
    await page
        .locator('.submissionFilesListPanel input[type="file"]')
        .setInputFiles({
            name: fileName,
            mimeType: 'text/plain',
            buffer: Buffer.from(`Manuscript ${fileName}`),
        });
    const genreButton = page
        .locator('.listPanel--submissionFiles__setGenre')
        .getByRole('button', {name: genre, exact: true});
    await expect(genreButton).toBeVisible({timeout: 30_000});
    const saved = page.waitForResponse(
        (r) => r.url().includes('/files/') && r.ok()
    );
    await genreButton.click();
    await saved;
    await expect(
        page.locator('.listPanel--submissionFiles__itemGenre').filter({hasText: genre}).first()
    ).toBeVisible({timeout: 20_000});
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
    if (viaRail) {
        await railEntry(page, STEPS.review).click();
    } else {
        await footer(page).getByRole('button', {name: 'Continue', exact: true}).click();
    }
    await expectStep(page, STEPS.review);
    await validated;
    await expect(page.locator('.submissionWizard__loadingReview')).toHaveCount(0, {
        timeout: 20_000,
    });
}

/** The Review step's problems banner. */
function problemsBanner(page) {
    return page.locator('.submissionWizard__review_errors');
}

/**
 * On the Review step, press Submit, confirm the dialog, and wait for the
 * "Submission complete" screen.
 */
async function confirmSubmit(page) {
    const submit = footer(page).getByRole('button', {name: 'Submit', exact: true});
    await expect(submit).toBeEnabled({timeout: 20_000});
    await submit.click();
    const dialog = page
        .getByRole('dialog')
        .filter({hasText: 'Are you sure you want to complete this submission?'});
    await expect(dialog).toBeVisible({timeout: 10_000});
    await dialog.getByRole('button', {name: 'Submit', exact: true}).click();
    await expect(
        page.getByRole('heading', {name: 'Submission complete'})
    ).toBeVisible({timeout: 30_000});
}

/**
 * Walk a fresh draft to a completed submission: upload a manuscript, pass
 * every step, and submit from Review. The wizard must be open on its first
 * step. Returns after the "Submission complete" screen appears.
 */
async function completeAndSubmitDraft(page, fileName) {
    await expectStep(page, STEPS.files);
    await uploadWizardFile(page, fileName);
    await continueTo(page, STEPS.details);
    await continueTo(page, STEPS.contributors);
    await continueTo(page, STEPS.editors);
    await openReview(page);
    await expect(problemsBanner(page)).toHaveCount(0);
    await confirmSubmit(page);
}

/** Press "Save for Later" (footer) and wait for the Saved for Later screen. */
async function saveForLater(page) {
    await footer(page)
        .getByRole('button', {name: 'Save for Later', exact: true})
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

module.exports = {
    STEPS,
    startUrl,
    wizardUrl,
    footer,
    submittingToLine,
    railEntry,
    currentRailStep,
    expectStep,
    expectWizardOpen,
    fillStartTitle,
    beginSubmission,
    continueTo,
    uploadWizardFile,
    openReview,
    problemsBanner,
    confirmSubmit,
    completeAndSubmitDraft,
    saveForLater,
    openChangeSettings,
};
