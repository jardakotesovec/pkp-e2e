// @ts-check
/**
 * @file playwright/pages/ProductionStagePages.js
 *
 * OJS-local Page Object for the Production stage (spec:
 * docs/specs/U33-production-stage.md). The stage's main column has the same
 * shape as the Copyediting stage's (a notice box headed "Notification", file
 * lists as a heading + description + table, a discussions panel, the
 * decision buttons in the action region, the Participants rows on the
 * right), so `ProductionStagePage` extends `CopyeditingStagePage`
 * (`./CopyeditingStagePages.js`) and adds only what is this stage's own:
 * - the landing (menu key `workflow_5`, heading "Workflow: Production");
 * - the one "Production Ready Files" list with its "Upload" button, which
 *   opens the upload wizard "Upload a Production Ready File" directly (no
 *   "Upload/Select Files" window here, Rule 4), and the "Download All
 *   Files" button under the list (a zip download);
 * - the "Production Tasks & Discussions" rows;
 * - the two buttons "Schedule For Publication" (a shortcut to the newest
 *   version's "Title & Abstract" page, Rule 6) and "Move To Copyediting"
 *   (a decision, Rule 7), and the stage's own status texts.
 *
 * The shared workflow frame (header, side menu, columns, status box) is the
 * inherited `frame` (`shared/playwright/pages/WorkflowPage.js`); the decision
 * wizard's completion helpers (`recordDecision`, `leaveCompletion`,
 * `stepItems`) are `CopyeditingStagePages.js`'s and serve "Move To
 * Copyediting" unchanged.
 *
 * DOM shapes were read from the U33 claim-check notes (.reports/U33/
 * screen-notes.md, ccK1–ccK3) and the U32 page object's own reads.
 */
const {expect} = require('@playwright/test');
const {CopyeditingStagePage} = require('./CopyeditingStagePages.js');
const {uploadViaWizard, uploadWizardDialog, fileName} = require('./ReviewStagePages.js');

/** The stage's `workflowMenuKey` (WORKFLOW_STAGE_ID_PRODUCTION = 5). */
const PRODUCTION_MENU_KEY = 'workflow_5';

const NOTICE_ASSIGN_GALLEYS = 'Assign a user to create galleys using the Assign link in the Participants list.';
const NOTICE_AWAITING_GALLEYS = 'Awaiting Galleys.';
const PRODUCTION_READY_FILES = 'Production Ready Files';
const PRODUCTION_DISCUSSIONS = 'Production Tasks & Discussions';
const PRODUCTION_DESCRIPTION = 'These are the files that will be sent for publication';
const SCHEDULE_FOR_PUBLICATION = 'Schedule For Publication';
const MOVE_TO_COPYEDITING = 'Move To Copyediting';
const PRODUCTION_NOT_INITIATED = 'The Production stage has not yet been initiated.';
const SUBMISSION_PUBLISHED = 'Submission published.';
const UPLOAD_WIZARD_TITLE = 'Upload a Production Ready File';
const TITLE_AND_ABSTRACT = 'Title & Abstract';

exports.PRODUCTION_MENU_KEY = PRODUCTION_MENU_KEY;
exports.NOTICE_ASSIGN_GALLEYS = NOTICE_ASSIGN_GALLEYS;
exports.NOTICE_AWAITING_GALLEYS = NOTICE_AWAITING_GALLEYS;
exports.PRODUCTION_READY_FILES = PRODUCTION_READY_FILES;
exports.PRODUCTION_DISCUSSIONS = PRODUCTION_DISCUSSIONS;
exports.PRODUCTION_DESCRIPTION = PRODUCTION_DESCRIPTION;
exports.SCHEDULE_FOR_PUBLICATION = SCHEDULE_FOR_PUBLICATION;
exports.MOVE_TO_COPYEDITING = MOVE_TO_COPYEDITING;
exports.PRODUCTION_NOT_INITIATED = PRODUCTION_NOT_INITIATED;
exports.SUBMISSION_PUBLISHED = SUBMISSION_PUBLISHED;
exports.UPLOAD_WIZARD_TITLE = UPLOAD_WIZARD_TITLE;
exports.TITLE_AND_ABSTRACT = TITLE_AND_ABSTRACT;

exports.ProductionStagePage = class ProductionStagePage extends CopyeditingStagePage {
    // ---------------------------------------------------------------------
    // Landing
    // ---------------------------------------------------------------------

    /** Open the submission's workflow at its "Production" entry (editorial view). */
    async gotoEditorial(submissionId) {
        await this.frame.gotoEditorial(submissionId, {menuKey: PRODUCTION_MENU_KEY});
        await this.frame.expectStageHeading('Production');
    }

    /** Open the submission's workflow at its "Production" entry in the author's view (My Submissions). */
    async gotoAuthor(submissionId) {
        await this.frame.gotoAuthor(submissionId, {menuKey: PRODUCTION_MENU_KEY});
        await this.frame.expectStageHeading('Production');
    }

    /** Select "Production" in the workflow menu (after a shortcut or another stage's entry). */
    async selectProduction() {
        await this.frame.selectStage('Production');
    }

    // ---------------------------------------------------------------------
    // The status box (Rules 7b, 8)
    // ---------------------------------------------------------------------

    /** The entry of a submission that has not reached Production shows "The Production stage has not yet been initiated." */
    async expectNotInitiated() {
        await this.frame.expectStatus(PRODUCTION_NOT_INITIATED);
    }

    // ---------------------------------------------------------------------
    // "Production Ready Files" (Rule 4)
    // ---------------------------------------------------------------------

    /** The "Upload" button above "Production Ready Files" (the stage's only "Upload"). */
    uploadButton() {
        return this.frame.primaryColumn().getByRole('button', {name: 'Upload', exact: true});
    }

    /**
     * Press "Upload": the wizard "Upload a Production Ready File" opens on
     * its first step. Returns the wizard dialog for its title and steps.
     */
    async openUploadWizard() {
        await this.uploadButton().click();
        const wizard = uploadWizardDialog(this.page);
        await expect(wizard.getByRole('tab', {name: '1. Upload File'})).toBeVisible({timeout: 30_000});
        return wizard;
    }

    /**
     * Upload one file through "Upload" (wizard, three steps, "Complete") and
     * wait for its row: the finished upload joins the list at once.
     *
     * @param {string | {name: string, mimeType: string, buffer: Buffer}} file
     */
    async uploadProductionFile(file) {
        await this.openUploadWizard();
        await uploadViaWizard(this.page, {file});
        await expect(this.fileRow(PRODUCTION_READY_FILES, fileName(file))).toBeVisible({timeout: 30_000});
    }

    /** The "Download All Files" button under the list (rendered only while the list holds a file). */
    downloadAllButton() {
        return this.frame.primaryColumn().getByRole('button', {name: 'Download All Files', exact: true});
    }

    /**
     * Press "Download All Files": one zip downloads. Returns the download's
     * suggested file name ("<id>--production-ready-files.zip").
     */
    async downloadAll() {
        const popup = this.page.waitForEvent('popup', {timeout: 30_000}).catch(() => null);
        const [download] = await Promise.all([
            this.page.waitForEvent('download', {timeout: 30_000}),
            this.downloadAllButton().click(),
        ]);
        const extra = await popup;
        if (extra) {
            await extra.close().catch(() => {});
        }
        return download.suggestedFilename();
    }

    // ---------------------------------------------------------------------
    // Discussions (Rule 5)
    // ---------------------------------------------------------------------

    /** The rows of "Production Tasks & Discussions" carrying `text` (a discussion's title). */
    discussionRow(text) {
        return this.table(PRODUCTION_DISCUSSIONS).getByRole('row').filter({hasText: text});
    }

    // ---------------------------------------------------------------------
    // The buttons (Rules 6–7)
    // ---------------------------------------------------------------------

    /**
     * Press "Schedule For Publication": the newest version's "Title &
     * Abstract" page opens under the workflow's "Publication" group (no
     * decision is recorded; `selectProduction()` returns to the entry).
     */
    async pressScheduleForPublication() {
        await this.frame.pressShortcutToPage(SCHEDULE_FOR_PUBLICATION, TITLE_AND_ABSTRACT);
    }

    /** Any recommendation control on the open entry ("Recommend…" buttons; none is expected here, register A1). */
    recommendationControls() {
        return this.frame.dialog().getByRole('button', {name: /recommend/i});
    }
};
