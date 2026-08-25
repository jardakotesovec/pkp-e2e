// @ts-check
/**
 * @file playwright/pages/SubmissionWizardPage.js
 *
 * OJS-local Page Objects for the submission wizard feature
 * (spec: docs/specs/U21-submission-wizard.md).
 *
 * Surfaces:
 * - StartSubmissionPage — the "Make a Submission" start screen (`/submission`
 *   with no id): the start form (title, section, checklist, privacy), the
 *   not-accepting notice, the Not Allowed page.
 * - SubmissionWizardPage — the wizard itself (`/submission?id={id}`): step
 *   rail (collapse-aware gotoStep/expectStep per the patterns.md recorded
 *   design), footer buttons, the "Submitting to…" line + Change modal, the
 *   Upload Files panel's dropzone upload, Review panels and their Edit
 *   buttons, the submit and cancel dialogs, save-for-later.
 *
 * Labels are the live locale strings (lib/pkp/locale/en/*.po + OJS
 * overrides); DOM shapes from lib/pkp/templates/submission/*.tpl and
 * lib/ui-library SubmissionWizardPage.vue / Steps.vue, confirmed against the
 * running app while this suite was built (2026-08-25).
 */
const path = require('path');
const {expect} = require('@playwright/test');
const {BasePage} = require('../../../../shared/playwright/pages/BasePage.js');

/** Default upload fixture (app-local). */
const FIXTURE_PDF = path.join(__dirname, '..', 'fixtures', 'files', 'article.pdf');
const FIXTURE_PDF_NAME = 'article.pdf';

/** End-anchored, escaped name matcher (rail labels are "N Name"). */
function endAnchored(name) {
    return new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

/**
 * Fill a TinyMCE rich-text field by its control id (the editor renders an
 * iframe `{controlId}_ifr` beside the hidden backing textarea).
 */
async function fillTinyMce(page, controlId, text) {
    const body = page.frameLocator(`#${controlId}_ifr`).locator('body');
    await body.click();
    await body.fill(text);
}

exports.FIXTURE_PDF = FIXTURE_PDF;
exports.FIXTURE_PDF_NAME = FIXTURE_PDF_NAME;

exports.StartSubmissionPage = class StartSubmissionPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    async goto() {
        await this.page.goto(this.contextUrl(this.contextPath, '/submission'));
    }

    heading() {
        return this.page.getByRole('heading', {name: 'Make a Submission'});
    }

    beginButton() {
        return this.page.getByRole('button', {name: 'Begin Submission'});
    }

    /** The one-line rich-text Title (a TinyMCE iframe editor). */
    async fillTitle(text) {
        await fillTinyMce(this.page, 'startSubmission-title-control', text);
    }

    checklistBox() {
        return this.page.getByRole('checkbox', {
            name: 'Yes, my submission meets all of these requirements.',
        });
    }

    privacyBox() {
        return this.page.getByRole('checkbox', {
            name: /I agree to have my data collected and stored/,
        });
    }

    sectionRadio(title) {
        return this.page.getByRole('radio', {name: title, exact: true});
    }

    /** The not-accepting notice (submissions disabled). */
    notAcceptingNotice() {
        return this.page.getByText('This journal is not accepting submissions at this time.');
    }

    /**
     * Press "Begin Submission" and wait for the wizard to load (the button
     * spins while the draft is created and the redirect lands).
     */
    async begin() {
        await this.beginButton().click();
        await this.page.waitForURL(/[?&]id=\d+/, {waitUntil: 'commit', timeout: 45_000});
    }
};

exports.SubmissionWizardPage = class SubmissionWizardPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    wizardUrl(submissionId) {
        return this.contextUrl(this.contextPath, `/submission?id=${submissionId}`);
    }

    async goto(submissionId) {
        await this.page.goto(this.wizardUrl(submissionId));
        await this.expectLoaded();
    }

    /** The wizard page shell is mounted (heading + step rail). */
    async expectLoaded() {
        await expect(
            this.page.getByRole('heading', {name: /Make a Submission/})
        ).toBeVisible({timeout: 30_000});
        await expect(this.page.locator('.pkpSteps')).toBeVisible({timeout: 30_000});
    }

    /** The "{id} / {authors} / {title}" line above the page heading. */
    submissionDetailsLine() {
        return this.page.locator('.submissionWizard__submissionDetails');
    }

    /** The "Submitting to…" line (absent on single-config journals). */
    submittingToLine() {
        return this.page.locator('#submission-configuration');
    }

    changeButton() {
        return this.submittingToLine().getByRole('button', {name: 'Change'});
    }

    footer() {
        return this.page.locator('.submissionWizard__footer');
    }

    continueButton() {
        return this.footer().getByRole('button', {name: 'Continue', exact: true});
    }

    backButton() {
        return this.footer().getByRole('button', {name: 'Back', exact: true});
    }

    submitButton() {
        return this.footer().getByRole('button', {name: 'Submit', exact: true});
    }

    /** The footer Save for Later (a second copy sits in the header). */
    saveForLaterButton() {
        return this.footer().getByRole('button', {name: 'Save for Later', exact: true});
    }

    cancelButton() {
        return this.page.locator('#cancelSubmission');
    }

    /** The current step's rail pill. */
    currentStepLabel() {
        return this.page.locator('.pkpSteps__step__label--current');
    }

    async expectStep(name) {
        await expect(this.currentStepLabel()).toContainText(name, {timeout: 30_000});
    }

    /** A rail entry (button when started, plain span when not yet reached). */
    railEntry(name) {
        return this.page
            .locator('.pkpSteps__step__label')
            .filter({hasText: endAnchored(name)});
    }

    railButton(name) {
        return this.page
            .locator('button.pkpSteps__step__label')
            .filter({hasText: endAnchored(name)});
    }

    /**
     * Open a started step from the rail. Handles the collapsed («n/total
     * steps» + "Show all steps") state and re-render-swallowed clicks
     * (patterns.md recorded design).
     */
    async gotoStep(name) {
        for (let attempt = 0; attempt < 3; attempt++) {
            if (await this.page.locator('.pkpSteps--collapsed').count()) {
                const controls = this.page.locator('.pkpSteps__controls button');
                if (await controls.count()) {
                    await controls.click();
                }
            }
            await this.railButton(name).click();
            try {
                await expect(this.currentStepLabel()).toContainText(name, {timeout: 5_000});
                return;
            } catch (error) {
                if (attempt === 2) {
                    throw error;
                }
            }
        }
    }

    /** Press Continue and wait for the named step to become current. */
    async continueTo(name) {
        await this.continueButton().click();
        await this.expectStep(name);
    }

    /**
     * A pending wait for the submission check the Review step runs (the
     * `_validateOnly` PUT to …/submit, tunnelled as POST). Arm BEFORE the
     * action that opens Review.
     */
    armValidation(submissionId) {
        return this.page.waitForResponse(
            (r) =>
                r.url().includes(`/submissions/${submissionId}/submit`) &&
                r.request().method() === 'POST',
            {timeout: 45_000}
        );
    }

    /** Enter the Review step (via Continue) and wait out the check. */
    async continueToReview(submissionId) {
        const validated = this.armValidation(submissionId);
        await this.continueButton().click();
        await this.expectStep('Review');
        await validated;
    }

    /** The Review step's problems banner. */
    errorBanner() {
        return this.page.getByText(
            'There are one or more problems that need to be fixed before you can submit.'
        );
    }

    /** A Review summary panel by its h3 (Files, Details, Contributors, …). */
    reviewPanel(name) {
        return this.page
            .locator('.submissionWizard__reviewPanel')
            .filter({has: this.page.getByRole('heading', {name, exact: true})});
    }

    /** Jump back to a step through its Review panel's Edit button. */
    async editFromPanel(name) {
        await this.reviewPanel(name).getByRole('button', {name: 'Edit'}).click();
    }

    /**
     * Upload a file on the Upload Files step through the panel's own
     * dropzone ("Add File" opens the OS file chooser) and answer the
     * "What kind of file is this?" prompt with the given file type.
     */
    async uploadFile(filePath = FIXTURE_PDF, genreName = 'Article Text') {
        const [chooser] = await Promise.all([
            this.page.waitForEvent('filechooser'),
            this.page.getByRole('button', {name: 'Add File', exact: true}).click(),
        ]);
        await chooser.setFiles(filePath);
        await this.page.getByRole('button', {name: genreName, exact: true}).click();
        const row = this.page
            .locator('.listPanel__item--submissionFile')
            .filter({hasText: path.basename(filePath)});
        await expect(row.getByText(genreName)).toBeVisible({timeout: 30_000});
    }

    /**
     * Fill a TinyMCE rich-text control of a wizard form (e.g.
     * fillRichText('titleAbstract-abstract-control-en', 'Text…')).
     */
    async fillRichText(controlId, text) {
        await fillTinyMce(this.page, controlId, text);
    }

    /** Press Submit, confirm the dialog, land on "Submission complete". */
    async submitAndConfirm() {
        await this.submitButton().click();
        const dialog = this.page
            .getByRole('dialog')
            .filter({hasText: 'will be submitted to'});
        await expect(dialog).toBeVisible({timeout: 30_000});
        await dialog.getByRole('button', {name: 'Submit', exact: true}).click();
        await expect(
            this.page.getByRole('heading', {name: 'Submission complete'})
        ).toBeVisible({timeout: 45_000});
    }

    /** Press the footer Cancel, confirm, land on "Submission cancelled". */
    async cancelAndConfirm() {
        await this.cancelButton().click();
        const dialog = this.page
            .getByRole('dialog')
            .filter({hasText: 'Are you sure you wish to cancel this submission?'});
        await expect(dialog).toBeVisible({timeout: 30_000});
        await dialog.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(
            this.page.getByRole('heading', {name: 'Submission cancelled'})
        ).toBeVisible({timeout: 45_000});
    }

    /** Press Save for Later, land on the "Saved for Later" screen. */
    async saveForLater() {
        await this.saveForLaterButton().click();
        await expect(
            this.page.getByRole('heading', {name: 'Saved for Later'})
        ).toBeVisible({timeout: 45_000});
    }

    /** The "Change Submission Settings" side panel. */
    reconfigureModal() {
        return this.page
            .locator('[data-cy="active-modal"]')
            .filter({hasText: 'Change Submission Settings'});
    }
};
