// @ts-check
/**
 * @file playwright/pages/PublicationPages.js
 *
 * OMP publication-page helpers the workflow frame's tests share: the
 * "Unpublish" dialog a press's "Title & Abstract" offers on a published
 * monograph (U49's dialog; U24 S8 drives it to watch the submission leave
 * Done by itself). The frame itself (header, menu, status box, the return
 * and delete dialogs) is the shared `WorkflowPage`.
 */
const {expect} = require('@playwright/test');

/** The Unpublish dialog's verbatim question (U49 Rule 9). */
const UNPUBLISH_QUESTION = "Are you sure you don't want this to be published?";

/**
 * Press "Unpublish" in the open publication page's right control region
 * and confirm its dialog. Resolves once the unpublish endpoint has
 * answered and the dialog has closed; what the panel shows next (the
 * bubble, the stripe, the header) is the caller's to assert. Live
 * 2026-09-13 (OMP): the dialog is titled "Unpublish", carries the question
 * and the buttons "Unpublish" / "Cancel".
 *
 * @param {import('@playwright/test').Page} page
 */
async function unpublishFromWorkflow(page) {
    await page
        .locator('[data-cy="workflow-controls-right"]')
        .getByRole('button', {name: 'Unpublish', exact: true})
        .click();
    const dialog = page.getByRole('dialog', {name: 'Unpublish', exact: true});
    await expect(dialog).toBeVisible({timeout: 30_000});
    await expect(dialog.getByText(UNPUBLISH_QUESTION)).toBeVisible();
    const unpublished = page.waitForResponse(
        (r) => r.url().includes('/unpublish') && r.ok(),
        {timeout: 30_000}
    );
    await dialog.getByRole('button', {name: 'Unpublish', exact: true}).click();
    await unpublished;
    await expect(dialog).toHaveCount(0, {timeout: 30_000});
}

module.exports = {UNPUBLISH_QUESTION, unpublishFromWorkflow};
