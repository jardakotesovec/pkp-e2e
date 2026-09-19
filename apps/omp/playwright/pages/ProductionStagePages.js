// @ts-check
/**
 * @file playwright/pages/ProductionStagePages.js
 *
 * App-local helpers for the OMP Production stage suite (U33, spec:
 * docs/specs/U33-production-stage.md): the entry's landing, the press's
 * notice box (whose heading IS the text, "Awaiting approval." or "Catalog
 * Management", with no "Notification" heading), the "Production Ready
 * Files" list with its "Upload" wizard and "Download All Files", the
 * discussions panel, the two buttons "Schedule For Publication" (a shortcut
 * to "Title & Abstract") and "Move To Copyediting" (a decision), and the
 * author's view. The workflow frame is `ReviewStagePages.js`'s; the file
 * rows, the decision wizard's completion and the Copyediting entry are
 * `CopyeditingStagePages.js`'s, reused as they are. Screen shapes from the
 * U33 claim check (2026-09-19, `.reports/U33/screen-notes.md`, ccK1–ccK3).
 */
const {expect} = require('../support/fixtures.js');
const {
    editorialUrl,
    authorUrl,
    workflowModal,
    primaryRegion,
    actionsRegion,
    decisionButton,
    awaitComposerReady,
} = require('./ReviewStagePages.js');
const {fileList, fileRow, uploadWizard, UPLOAD_WIZARD_STEPS, wizardSteps} = require('./CopyeditingStagePages.js');

/** The workflow menu key of the Production stage entry (WORKFLOW_STAGE_ID_PRODUCTION = 5). */
const PRODUCTION_MENU_KEY = 'workflow_5';

/** The stage's two buttons, in the order the screen shows them (Rules 1, 6, 7). */
const PRODUCTION_DECISIONS = {
    schedule: 'Schedule For Publication',
    moveToCopyediting: 'Move To Copyediting',
};

/** The press's notice box: its heading is the text itself (Rule 3d; OMP1). */
const PRESS_NOTICES = {
    awaiting: {
        heading: 'Awaiting approval.',
        sentence:
            'The monograph will not be listed in the catalog until it has been published. To add this book to the catalog, click on the Publication tab.',
    },
    catalog: {
        heading: 'Catalog Management',
        sentence:
            'The monograph has been approved. Please visit Marketing and Publication to manage its catalog details, using the links just above.',
    },
};

/** The journal's galley notices, which a press never shows (Rule 3d; OMP1). */
const JOURNAL_NOTICES = [
    'Assign a user to create galleys using the Assign link in the Participants list.',
    'Awaiting Galleys.',
];

/** The status-box sentences the "Production" entry shows off the stage (Rules 7b, 8). */
const PRODUCTION_STATUS = {
    notInitiated: 'The Production stage has not yet been initiated.',
    published: 'Submission published.',
};

/** The main-column panels (Rule 1). */
const PRODUCTION_READY_FILES = 'Production Ready Files';
const PRODUCTION_DISCUSSIONS = 'Production Tasks & Discussions';
const PRODUCTION_DESCRIPTION = 'These are the files that will be sent for publication';

/** The "Upload" wizard's title (Rule 4). */
const UPLOAD_WIZARD_TITLE = 'Upload a Production Ready File';

/** The "Move To Copyediting" completion dialog (Rule 7) and the authors' email (Side effects). */
const MOVED_TO_COPYEDITING = {
    title: 'Moved to Copyediting',
    message: (title) =>
        `The submission, ${title}, was moved to the copyediting stage. The author has been notified, unless you chose to skip that email.`,
    authorMail: 'Your submission has been moved to copyediting',
};

/** The "Ready for Production" message's email and Tasks-panel rows (Side effects). */
const READY_FOR_PRODUCTION = {
    template: 'Ready for Production',
    subject: 'Ready for Production',
    task: (title) => `You have been asked to review layouts for "${title}".`,
    discussionRow: /started a discussion: Ready for Production/,
};

/** The "Title & Abstract" page's heading the shortcut lands on (Rule 6). */
const TITLE_AND_ABSTRACT_HEADING = 'Publication: Title & Abstract';

// ---------------------------------------------------------------------
// Landing
// ---------------------------------------------------------------------

/** Open the submission's "Production" entry in the editorial view and wait for its heading. */
async function openProduction(page, contextPath, submissionId) {
    await page.goto(`${editorialUrl(contextPath, submissionId)}&workflowMenuKey=${PRODUCTION_MENU_KEY}`);
    const modal = workflowModal(page);
    await expect(modal.getByRole('heading', {name: 'Workflow: Production'})).toBeVisible({timeout: 20_000});
    return modal;
}

/** The same entry in the author's (My Submissions) view. */
async function openAuthorProduction(page, contextPath, submissionId) {
    await page.goto(`${authorUrl(contextPath, submissionId)}&workflowMenuKey=${PRODUCTION_MENU_KEY}`);
    const modal = workflowModal(page);
    await expect(modal.getByRole('heading', {name: 'Workflow: Production'})).toBeVisible({timeout: 20_000});
    return modal;
}

// ---------------------------------------------------------------------
// The notice box (Rule 3d)
// ---------------------------------------------------------------------

/** The press notice's heading ("Awaiting approval." / "Catalog Management"). */
function pressNoticeHeading(modal, notice) {
    return primaryRegion(modal).getByRole('heading', {name: notice.heading, exact: true});
}

/** The press notice box: the heading and, under it, the sentence (Rule 3d). */
async function expectPressNotice(modal, notice) {
    await expect(pressNoticeHeading(modal, notice)).toBeVisible({timeout: 20_000});
    await expect(pressNoticeHeading(modal, notice).locator('..')).toContainText(notice.sentence);
}

/**
 * Neither journal notice, nor the journal's "Notification" heading (OMP1).
 * An absence read: the caller pairs it with the press notice on the same
 * screen.
 */
async function expectNoJournalNotice(modal) {
    await expect(primaryRegion(modal).getByRole('heading', {name: 'Notification', exact: true})).toHaveCount(0);
    for (const sentence of JOURNAL_NOTICES) {
        await expect(primaryRegion(modal).getByText(sentence)).toHaveCount(0);
    }
}

/**
 * The main column's panel headings, in order, among those the entry can
 * show: a status box, the press notice, the list, the discussions panel.
 * `toHaveText` on the array asserts order and count.
 */
function productionHeadings(modal) {
    return primaryRegion(modal).getByRole('heading', {
        name: /^(Status|Notification|Awaiting approval\.|Catalog Management|Production Ready Files|Production Tasks & Discussions)$/,
    });
}

// ---------------------------------------------------------------------
// "Production Ready Files" (Rule 4)
// ---------------------------------------------------------------------

/** The line under the list's heading (Rule 1). */
function listDescription(modal) {
    return primaryRegion(modal).getByText(PRODUCTION_DESCRIPTION, {exact: true});
}

/** The "Upload" button above the list (the stage's only "Upload"). */
function uploadButton(modal) {
    return primaryRegion(modal).getByRole('button', {name: 'Upload', exact: true});
}

/**
 * Press "Upload": the wizard "Upload a Production Ready File" opens on its
 * first step. Returns the wizard dialog for its steps.
 */
async function openUploadWizard(page, modal) {
    await uploadButton(modal).click();
    const wizard = uploadWizard(page);
    await expect(wizard.getByRole('tab', {name: UPLOAD_WIZARD_STEPS[0]})).toBeVisible({timeout: 20_000});
    return wizard;
}

/**
 * Walk the open wizard: pick the component, transfer an in-memory file,
 * Continue, Continue, Complete; then wait for the list's row (the finished
 * upload joins the list at once, Rule 4).
 */
async function completeProductionUpload(page, modal, wizard, fileName) {
    const genre = wizard.locator('select[id^="genreId"]');
    await expect(genre).toBeVisible({timeout: 20_000});
    await genre.selectOption({label: 'Book Manuscript'});
    await page.locator('input[type="file"]').last().setInputFiles({
        name: fileName,
        mimeType: 'text/plain',
        buffer: Buffer.from(`Production ready file ${fileName}`),
    });
    await expect(wizard.getByRole('button', {name: /Change File/})).toBeVisible({timeout: 20_000});
    await wizard.getByRole('button', {name: 'Continue', exact: true}).click();
    await expect(wizard.getByRole('tab', {name: UPLOAD_WIZARD_STEPS[1]})).toHaveAttribute('aria-selected', 'true', {timeout: 20_000});
    await wizard.getByRole('button', {name: 'Continue', exact: true}).click();
    await expect(wizard.getByRole('tab', {name: UPLOAD_WIZARD_STEPS[2]})).toHaveAttribute('aria-selected', 'true', {timeout: 20_000});
    await wizard.getByRole('button', {name: 'Complete', exact: true}).click();
    await expect(wizard.getByRole('tab', {name: UPLOAD_WIZARD_STEPS[2]})).toBeHidden({timeout: 20_000});
    await expect(fileRow(modal, PRODUCTION_READY_FILES, fileName).first()).toBeVisible({timeout: 20_000});
}

/** The list's "Download All Files" button (rendered only while the list holds a file). */
function downloadAllButton(modal) {
    return primaryRegion(modal).getByRole('button', {name: 'Download All Files', exact: true});
}

/**
 * Press a control that downloads: returns the download's suggested file
 * name. The click also opens an empty popup (U32 claim check K3), closed
 * here.
 */
async function downloadFrom(page, control) {
    const popup = page.waitForEvent('popup', {timeout: 20_000}).catch(() => null);
    const [download] = await Promise.all([page.waitForEvent('download', {timeout: 20_000}), control.click()]);
    const extra = await popup;
    if (extra) {
        await extra.close().catch(() => {});
    }
    return download.suggestedFilename();
}

/** Press the file's name: the file downloads; returns its suggested name. */
async function downloadFile(page, modal, fileName) {
    const link = fileRow(modal, PRODUCTION_READY_FILES, fileName).first().getByRole('link', {name: fileName});
    return downloadFrom(page, link);
}

/** Press "Download All Files": one zip downloads ("<id>--production-ready-files.zip"). */
async function downloadAll(page, modal) {
    return downloadFrom(page, downloadAllButton(modal));
}

/** The "Production Ready Files" table (absent in the author's view and off the stage). */
function productionFilesList(modal) {
    return fileList(modal, PRODUCTION_READY_FILES);
}

// ---------------------------------------------------------------------
// The discussions panel (Rule 5)
// ---------------------------------------------------------------------

function discussionsPanel(modal) {
    return primaryRegion(modal).getByRole('table', {name: PRODUCTION_DISCUSSIONS, exact: true});
}

/** The panel's row(s) carrying `text` (a discussion's title). */
function discussionRow(modal, text) {
    return discussionsPanel(modal).getByRole('row').filter({hasText: text});
}

// ---------------------------------------------------------------------
// The buttons (Rules 6–8)
// ---------------------------------------------------------------------

/** The action region's buttons are exactly these, left to right (auto-waited). */
async function expectDecisionButtons(modal, labels) {
    await expect(actionsRegion(modal).getByRole('button')).toHaveText(labels, {timeout: 20_000});
}

/** The button is drawn as the primary (highlighted) one. */
async function expectHighlighted(modal, label) {
    await expect(decisionButton(modal, label)).toHaveClass(/\bbg-primary\b/);
}

async function expectNotHighlighted(modal, label) {
    await expect(decisionButton(modal, label)).not.toHaveClass(/\bbg-primary\b/);
}

/** Any recommendation control on the open entry (none is expected here, A1). */
function recommendationControls(modal) {
    return modal.getByRole('button', {name: /recommend/i});
}

/**
 * Press "Schedule For Publication": the newest version's "Title & Abstract"
 * page opens under the "Publication" group (no decision is recorded;
 * `selectStage(modal, 'Production')` returns to the entry).
 */
async function pressScheduleForPublication(modal) {
    await decisionButton(modal, PRODUCTION_DECISIONS.schedule).click();
    await expect(modal.getByRole('heading', {name: TITLE_AND_ABSTRACT_HEADING})).toBeVisible({timeout: 20_000});
}

/**
 * Press "Move To Copyediting" (Rule 7): the wizard opens on its one page,
 * "Notify Authors". Returns on that page; the caller records it with
 * `recordAndExpectCompletion`.
 */
async function startMoveToCopyediting(page, modal) {
    await decisionButton(modal, PRODUCTION_DECISIONS.moveToCopyediting).click();
    await expect(page.getByRole('heading', {level: 1, name: /Move To Copyediting/})).toBeVisible({timeout: 15_000});
    await expect(wizardSteps(page)).toHaveText([/Notify Authors/]);
    await awaitComposerReady(page);
}

module.exports = {
    PRODUCTION_MENU_KEY,
    PRODUCTION_DECISIONS,
    PRESS_NOTICES,
    JOURNAL_NOTICES,
    PRODUCTION_STATUS,
    PRODUCTION_READY_FILES,
    PRODUCTION_DISCUSSIONS,
    PRODUCTION_DESCRIPTION,
    UPLOAD_WIZARD_TITLE,
    MOVED_TO_COPYEDITING,
    READY_FOR_PRODUCTION,
    TITLE_AND_ABSTRACT_HEADING,
    openProduction,
    openAuthorProduction,
    pressNoticeHeading,
    expectPressNotice,
    expectNoJournalNotice,
    productionHeadings,
    listDescription,
    uploadButton,
    openUploadWizard,
    completeProductionUpload,
    downloadAllButton,
    downloadFile,
    downloadAll,
    productionFilesList,
    discussionsPanel,
    discussionRow,
    expectDecisionButtons,
    expectHighlighted,
    expectNotHighlighted,
    recommendationControls,
    pressScheduleForPublication,
    startMoveToCopyediting,
};
