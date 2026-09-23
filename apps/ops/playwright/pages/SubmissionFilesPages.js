// @ts-check
/**
 * @file playwright/pages/SubmissionFilesPages.js
 *
 * Submission files on a preprint server (feature U36, spec
 * docs/specs/U36-submission-files.md), OPS-only by design (PRINCIPLES M1):
 * a preprint server has no workflow file lists (register OPS1), so the
 * feature's machinery shows only through a galley's row menu on the
 * publication's "Galleys" page. The journal and press lists live in
 * `shared/playwright/pages/SubmissionFilesPages.js`; this file carries what
 * the OPS absence scenario (S11) reads, on top of the shared `WorkflowPage`
 * frame and the Production stage's own page object (U33).
 *
 * Surfaces:
 * - the workflow file lists and their controls a journal or press shows,
 *   read for the absence assertions: the six list tables by title, the
 *   "Upload" button and the "Upload/Select Files" button;
 * - the "Galleys" page's table, a galley's row and its "More Actions" menu;
 * - the "More Information" window ("Information Center: {galley label}"),
 *   its tabs and the "History" tab's table columns (Rule 13).
 *
 * DOM facts (confirmed live 2026-09-23, .reports/U36/screen-notes.md ccK1
 * and the K1 aria records): the "Galleys" page is the main column's
 * `table "Galleys"`, a row's menu button is named "More Actions" and its
 * items are page-level `role=menuitem` (Edit / Change File / More
 * Information / Delete); the information window is a dialog named
 * "Information Center: PDF" with a level-1 heading of the same text and a
 * tablist "History" (selected on open) / "Notes".
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('../../../../shared/playwright/pages/BasePage.js');

/** Every workflow file list a journal or press shows (Rule 1; the stage specs). */
const WORKFLOW_FILE_LISTS = [
    'Submission Files',
    'Files for Review',
    'Revisions Uploaded',
    'Draft Files',
    'Copyedited Files',
    'Production Ready Files',
];

/** The "More Information" window's tabs, in order (Rule 13). */
const INFO_CENTER_TABS = ['History', 'Notes'];

/** The "History" table's columns (Rule 13a). */
const HISTORY_COLUMNS = ['Date', 'User', 'Event'];

exports.WORKFLOW_FILE_LISTS = WORKFLOW_FILE_LISTS;
exports.INFO_CENTER_TABS = INFO_CENTER_TABS;
exports.HISTORY_COLUMNS = HISTORY_COLUMNS;

exports.GalleyFilesPage = class GalleyFilesPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('../../../../shared/playwright/pages/WorkflowPage.js').WorkflowPage} frame the open workflow panel
     */
    constructor(page, frame) {
        super(page);
        this.frame = frame;
    }

    // ---------------------------------------------------------------------
    // The workflow file lists (absence reads; OPS1)
    // ---------------------------------------------------------------------

    /** A workflow file list anywhere in the panel, by its title. */
    fileList(title) {
        return this.frame.dialog().getByRole('table', {name: title, exact: true});
    }

    /** A list's "Upload" button anywhere in the panel. */
    uploadButton() {
        return this.frame.dialog().getByRole('button', {name: 'Upload', exact: true});
    }

    /** The copy window's "Upload/Select Files" button, anywhere on the page. */
    uploadSelectFilesButton() {
        return this.page.getByRole('button', {name: 'Upload/Select Files', exact: true});
    }

    /**
     * No workflow file list, no "Upload" and no "Upload/Select Files" on the
     * open panel: every list title by its table and by its text. The caller
     * pairs it with a table and a button that did render (the discussions
     * panel and its "Add").
     */
    async expectNoFileLists() {
        for (const title of WORKFLOW_FILE_LISTS) {
            await expect(this.fileList(title)).toHaveCount(0);
            await expect(this.frame.dialog().getByText(title, {exact: true})).toHaveCount(0);
        }
        await expect(this.uploadButton()).toHaveCount(0);
        await expect(this.uploadSelectFilesButton()).toHaveCount(0);
        await expect(this.page.getByText('Upload/Select Files')).toHaveCount(0);
    }

    // ---------------------------------------------------------------------
    // The "Galleys" page (Actors row "A galley's file"; Rule 13)
    // ---------------------------------------------------------------------

    /** The "Galleys" table on the publication's "Galleys" page. */
    galleysTable() {
        return this.frame.primaryColumn().getByRole('table', {name: 'Galleys', exact: true});
    }

    /** A galley's row by its label link ("PDF"). */
    galleyRow(label) {
        return this.galleysTable()
            .getByRole('row')
            .filter({has: this.page.getByRole('link', {name: label, exact: true})});
    }

    /** Open a galley row's "More Actions" menu and press one of its items. */
    async pressGalleyMenuItem(label, item) {
        const row = this.galleyRow(label);
        await expect(row).toBeVisible({timeout: 30_000});
        await row.getByRole('button', {name: 'More Actions', exact: true}).click();
        await this.page.getByRole('menuitem', {name: item, exact: true}).click();
    }

    // ---------------------------------------------------------------------
    // The "More Information" window (Rule 13)
    // ---------------------------------------------------------------------

    /** The window "Information Center: {name}". */
    infoCenter(name) {
        return this.page.getByRole('dialog', {name: `Information Center: ${name}`, exact: true});
    }

    /** Press the galley's "More Information"; returns the window once its tabs are in. */
    async openGalleyInformation(label) {
        await this.pressGalleyMenuItem(label, 'More Information');
        const win = this.infoCenter(label);
        await expect(win.getByRole('tab').first()).toBeVisible({timeout: 30_000});
        return win;
    }

    /** The window's tab labels, left to right. */
    async infoCenterTabLabels(name) {
        const texts = await this.infoCenter(name).getByRole('tab').allTextContents();
        return texts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    }

    /** One of the window's tabs by its label. */
    infoCenterTab(name, tab) {
        return this.infoCenter(name).getByRole('tab', {name: tab, exact: true});
    }

    /** The window's open tab panel (a tabpanel named after its tab). */
    infoCenterPanel(name, tab) {
        return this.infoCenter(name).getByRole('tabpanel', {name: tab, exact: true});
    }

    /** The "History" panel's column headers, left to right. */
    async historyColumns(name) {
        const texts = await this.infoCenterPanel(name, 'History').getByRole('columnheader').allTextContents();
        return texts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    }
};
