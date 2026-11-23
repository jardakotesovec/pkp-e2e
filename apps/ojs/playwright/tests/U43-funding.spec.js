// @ts-check
/**
 * @file playwright/tests/U43-funding.spec.js
 *
 * Funding — OJS suite, one test per canonical scenario the spec runs on
 * OJS (S1–S5 common; S6 {OJS OMP}).
 * Spec: docs/specs/U43-funding.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A3 🐞: S1's registry funder (NIH, which the install's copy lacks) has
 *   its pick's error window dismissed and its row found by the ROR mark;
 *   nothing reads what the row shows beside the mark.
 * - A4 🐞: a press and preprint-server matter; S2 reads the table at once.
 * - A5 🐞: the ordering arrows are reached positionally; nothing reads
 *   their names, nor the name boxes' labels.
 * - A7 ❓: S1 and S3 add every funder before ordering; the funder S1 adds
 *   through the French panel is read for presence, never position.
 * - A8 ❓: S4 picks the "Do not request…" level itself on the re-tick.
 * - A10 ❓, A11 ❓: not on these scenarios' paths (no server reaching
 *   the registry).
 * - A12 ❓: every name box is left as it arrives or filled.
 * - A15 🐞: S1 leaves "Edit Funder" with "Close" only after a saved
 *   change, with no grant row added or deleted.
 * - A16 ❓: S1's failed searches are cleared with "Delete"; what stood in
 *   the name box behind the window is never read.
 * - A2, A6: not on these scenarios' paths; OPS1 is the preprint
 *   server's, in that tree.
 *
 * Hermeticity: the Funder field queries the public ROR registry from the
 * BROWSER; the suite stubs that query (FundingPages.stubRegistrySearch):
 * an empty result set unless records are given; S1, S2 and S3 answer a
 * query NSERC's names match with NSERC's registry record (the fixture
 * ../fixtures/ror-nserc-v2.json, the same record each seeds into the
 * install's copy), and S1 a query NIH's names match with NIH's
 * (../fixtures/ror-nih-v2.json, never seeded into the copy). S1's failed
 * searches switch the same stub to a dropped connection, a 503 and a 429
 * (footnote s1). No test depends on api.ror.org — the typed-name path
 * renders its typed-text option independently of the suggestions payload.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only for settings (S4 and S6 run on scratch journals with
 * throwaway users). There is no funder seeding key — the add/edit panel IS
 * the surface under test, so funders are always recorded through it. The
 * given of S1–S3, NSERC held in the install's registry copy, is `POST
 * site` `rors` (idempotent, parallel-safe; no test of this suite reads an
 * empty copy).
 * S1's French leg runs last in that test: a /fr_CA/ visit switches the
 * test's own session to French. The
 * mailbox silence (S1) is read in the shared Mailpit scoped to a throwaway
 * submitter's address the test created on a scratch journal (users are
 * created there and nowhere else) and bounded by a mail the test itself
 * sends the same way, the manager's "Notify" on a spare account's own
 * submission (A8, M4); the Activity Log silence is a row count before
 * and after, bounded by the test's own Title & Abstract save (the one
 * write that logs). Every absence is read with a settled locator and
 * paired with a positive control taken the same way (M6). Waits are
 * event-based (funders API responses, form-save responses, web-first
 * assertions) — no hard-coded sleeps. Everything runs in the parallel
 * `ojs` project.
 */
const fs = require('fs');
const {test, expect} = require('../support/fixtures.js');
const {FundingScreen, stubRegistrySearch, landingFunders} = require('../pages/FundingPages.js');
const {PublicationScreen} = require('../pages/PublicationMetadataPages.js');
const {SubmissionWizardPage} = require('../pages/SubmissionWizardPage.js');
const {
    ReviewerAssignmentsPage,
    ReviewWizardPage,
} = require('../../../../shared/playwright/pages/ReviewerPages.js');

const JOURNAL = 'publicknowledge';
const NOTIFY_SUBJECT = 'Discussion (Submission)';
const EMPTY_LIST = 'No funders have been added.';
const FUNDER_REQUIRED = 'Search and select a Funder or enter a Funder name';
const DOI_FORMAT = 'This is not formatted correctly.';
const FUNDERS_REQUIRED = 'Funders are required.';
/**
 * The registry funder the install's copy already holds (S1, footnote s1):
 * NSERC's ROR API v2 record, seeded into the copy with `POST site` `rors`
 * and answering the browser-side search stub (scenarios.md "rors").
 */
const NSERC = require('../fixtures/ror-nserc-v2.json');
const NSERC_NAME = 'Natural Sciences and Engineering Research Council of Canada';
const NSERC_ROR = 'https://ror.org/01h531d29';
/**
 * The registry funder of S1 (footnote s1): NIH's ROR API v2 record, which
 * answers the browser-side search only; the install's copy lacks it, so
 * on the test installs its pick takes A3's path.
 */
const NIH = require('../fixtures/ror-nih-v2.json');
const NIH_NAME = 'National Institutes of Health';
const NIH_ROR = 'https://ror.org/01cwqze88';
/** The windows a failed registry search opens over the panel (Fields; footnote s1). */
const SEARCH_FAILED = {
    unreachable: {
        title: 'Error',
        message: 'An unexpected error has occurred. Please reload the page and try again.',
    },
    unavailable: {
        title: 'ROR API Error',
        message:
            'The ROR API service is currently unavailable. Please refresh the page or try again later.',
    },
    tooMany: {
        title: 'ROR API Error',
        message:
            'Too many requests have been sent to the ROR API. Please wait a moment before continuing to search.',
    },
};
const PROBLEMS_NOTICE =
    'There are one or more problems that need to be fixed before you can submit. Please review the information below and make the requested changes.';
/** The French list's strings (Rule 14; footnote i). */
const FR = {
    order: 'Trier',
    saveOrder: "Enregistrer l'ordre",
    menu: ['Modifier', 'Supprimer'],
    confirmTitle: 'Supprimer',
    confirm: 'Êtes-vous certain-e de vouloir supprimer cet élément ? Cette opération est irréversible.',
    ok: 'OK',
    cancel: 'Annuler',
    add: 'Ajouter',
    save: 'Enregistrer',
    close: 'Fermer',
    deleteChosen: 'Supprimer',
};

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u43${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

/**
 * Seed a scratch journal with one throwaway manager and one throwaway
 * author (plus, with `spare`, a third author-role account the mailbox
 * control is addressed to, and with `reviewer`, an external reviewer);
 * returns their usernames.
 *
 * @param {{spare?: boolean, reviewer?: boolean, review?: object}} options
 */
async function seedJournal(ojsApi, tag, {spare = false, reviewer = false, review} = {}) {
    const users = [
        {
            username: `${tag}mg`,
            givenName: 'Mona',
            familyName: 'Manager',
            email: mailOf(`${tag}mg`),
            roles: ['manager'],
        },
        {
            username: `${tag}au`,
            givenName: 'Ada',
            familyName: 'Author',
            email: mailOf(`${tag}au`),
            roles: ['author'],
        },
    ];
    if (spare) {
        users.push({
            username: `${tag}x`,
            givenName: 'Xena',
            familyName: 'Spare',
            email: mailOf(`${tag}x`),
            roles: ['author'],
        });
    }
    if (reviewer) {
        users.push({
            username: `${tag}rv`,
            givenName: 'Rita',
            familyName: 'Reviewer',
            email: mailOf(`${tag}rv`),
            roles: ['externalReviewer'],
        });
    }
    await ojsApi.createContext({
        tag,
        ...(review ? {review} : {}),
        users,
    });
    return {
        manager: `${tag}mg`,
        author: `${tag}au`,
        spare: spare ? `${tag}x` : null,
        reviewer: reviewer ? `${tag}rv` : null,
    };
}

/**
 * Open a page's workflow view and its Funding screen (the Publication group
 * is expanded by default; FundingScreen handles a collapsed one).
 */
async function openFunding(page, contextPath, submissionId, {author = false} = {}) {
    // Straight to the workflow dialog. Not via WorkflowPage.expectOpen: a
    // published submission's workflow opens on a "Publication: …" screen
    // with no "Workflow:" heading; FundingScreen waits on the Publication
    // menu instead.
    const dashboard = author ? 'mySubmissions' : 'editorial';
    await page.goto(
        `/index.php/${contextPath}/dashboard/${dashboard}?workflowSubmissionId=${submissionId}`
    );
    const funding = new FundingScreen(page);
    await funding.openFromWorkflow();
    return funding;
}

/**
 * Save the workflow settings' Metadata form (the one carrying the funders
 * setting), bounded by the context API answering OK.
 */
async function saveMetadataSettings(page) {
    const form = page
        .locator('form')
        .filter({has: page.getByRole('checkbox', {name: 'Enable funder metadata'})});
    const saved = page.waitForResponse(
        (r) =>
            r.url().includes('/api/v1/contexts/') &&
            r.request().method() === 'POST' &&
            r.ok(),
        {timeout: 30_000}
    );
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    await saved;
}

/** Open the Metadata settings screen (Settings › Workflow › Metadata). */
async function openMetadataSettings(page, contextPath) {
    await page.goto(`/index.php/${contextPath}/management/settings/workflow`);
    await page.locator('#metadata-button').click();
    await expect(page.getByRole('checkbox', {name: 'Enable funder metadata'})).toBeVisible({
        timeout: 30_000,
    });
}

/**
 * Reload a draft in the wizard and stand on its Details step: a reloaded
 * draft resumes at its saved step, and a not-yet-started step has no rail
 * button to jump to, so the walk goes forward from Upload Files when
 * Details is not already current.
 */
async function reopenAtDetails(wizard, submissionId) {
    await wizard.goto(submissionId);
    await expect(wizard.currentStepLabel()).toBeVisible({timeout: 30_000});
    if (!(await wizard.currentStepLabel().textContent())?.includes('Details')) {
        await wizard.expectStep('Upload Files');
        await wizard.continueTo('Details');
    }
    await wizard.expectStep('Details');
}

/**
 * The Activity Log's row count (the "Activity Log & Notes" window's grid,
 * `tr.gridRow`), read once the grid holds a row (a seeded submission
 * always carries its own lines), then the window closed.
 */
async function activityLogRowCount(pub) {
    const log = await pub.openActivityLog();
    const rows = log.locator('tr.gridRow');
    await expect(rows.first()).toBeVisible({timeout: 30_000});
    const count = await rows.count();
    await log.getByRole('button', {name: 'Close', exact: true}).first().click();
    await expect(log).toBeHidden({timeout: 30_000});
    return count;
}

/**
 * The mailbox silence, bounded: the manager's "Notify" on the spare's own
 * control submission is the one mail the test sends the same way, then
 * the throwaway submitter's address must hold nothing.
 */
async function expectNoMailToSubmitter(page, pkpMail, {tag, controlSubmissionId, author, spare}) {
    const controlPub = new PublicationScreen(page, JOURNAL);
    await controlPub.gotoWorkflow(controlSubmissionId);
    await controlPub.openStage('Submission');
    await controlPub.notifyParticipant('Xena Spare', `<p>Control ${tag}</p>`);
    await pkpMail.expectNone({
        to: mailOf(author),
        afterControl: {to: mailOf(spare), subject: NOTIFY_SUBJECT, contains: `Control ${tag}`},
    });
}

/** Move a row to the top with "Order" / its up arrow / "Save Order" (Rule 7). */
async function orderFirst(page, funding, name) {
    await funding.orderButton().click();
    // The row's up/down buttons carry no accessible name (A5 🐞), so they
    // are reached positionally — first button in the row is "up".
    await funding.row(name).locator('button').first().click();
    const orderSaved = page.waitForResponse(
        (r) =>
            r.url().includes('/funders/order') &&
            r.request().method() === 'POST' &&
            r.ok(),
        {timeout: 30_000}
    );
    await funding.saveOrderButton().click();
    await orderSaved;
}

test.describe('funding', () => {
    test('S1: record and revise funding in the workflow', {tag: '@smoke'}, async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(480_000);
        const tag = makeTag('s1', testInfo);
        const controlTag = makeTag('s1c', testInfo);
        // The throwaway submitter (the mailbox the silence is read in) and
        // the spare (the control mail's recipient) live on a scratch
        // journal and each submit to the seeded journal (footnote s1).
        const {author, spare} = await seedJournal(ojsApi, tag, {spare: true});
        // The given: the install's copy of the registry holds NSERC
        // (footnote s1; the key is idempotent and parallel-safe).
        const [{submissionId}, control] = await Promise.all([
            ojsApi.createSubmission({
                tag,
                context: JOURNAL,
                submitter: author,
                title: `Submission ${tag}`,
            }),
            ojsApi.createSubmission({
                tag: controlTag,
                context: JOURNAL,
                submitter: spare,
                title: `Submission ${controlTag}`,
            }),
            ojsApi.setSite({rors: [NSERC]}),
        ]);
        const nameA = `Test Foundation ${tag}`;
        const nameUnsaved = `Unsaved Foundation ${tag}`;
        const nameFr = `Fondation Exemple ${tag}`;

        // The browser-side registry search answers with NSERC's and NIH's
        // records for a query their names match, and with nothing
        // otherwise; its switch makes the failed-search states.
        const page = await (await asUser('manager.maya')).newPage();
        const registry = await stubRegistrySearch(page, [NSERC, NIH]);
        // "Nothing is asked": every browser dialog (a leave-page prompt) is
        // recorded, and accepted so a reload is never held up by one.
        const asked = [];
        page.on('dialog', async (dialog) => {
            asked.push(`${dialog.type()}: ${dialog.message()}`);
            await dialog.accept().catch(() => {});
        });
        const pub = new PublicationScreen(page, JOURNAL);
        let funding = await openFunding(page, JOURNAL, submissionId);

        // "Funding": the screen is headed "Publication: Funding"
        // (openFromWorkflow waits on it) with the heading "Funders", its
        // explanation, a table whose column is "Funder Name" and "Order"
        // and "Add Funder" above it (Rule 3).
        await expect(page.getByRole('heading', {name: 'Funders', exact: true})).toBeVisible();
        await expect(
            page.getByText(
                'Add formal funding information, ensuring funders are properly credited and appear in the publication metadata.'
            )
        ).toBeVisible();
        await expect(funding.table().getByRole('columnheader', {name: 'Funder Name'})).toBeVisible();
        await expect(funding.orderButton()).toBeVisible();
        await expect(funding.addFunderButton()).toBeVisible();

        // Control: before the first add the list reads "No funders have
        // been added." (Rule 3) — and the Activity Log's row count, the
        // baseline of "no new entry" below.
        await expect(funding.table()).toContainText(EMPTY_LIST);
        const logBefore = await activityLogRowCount(pub);

        // An empty save: refused in place — the field's message, "Please
        // correct one error." and Save disabled (Fields).
        await funding.addFunderButton().click();
        const addPanel = funding.dialog('Add Funder');
        await expect(addPanel).toBeVisible({timeout: 30_000});
        await funding.saveRefused(addPanel, addPanel.getByText(FUNDER_REQUIRED));
        await expect(funding.funderFieldError(addPanel)).toContainText(FUNDER_REQUIRED);

        // The typed-name funder: pick the typed text itself; the required
        // name box arrives pre-filled; "Delete" under it clears the field
        // back to the search box; search and pick again (Fields; Rule 5).
        await funding.pickTypedFunder(addPanel, nameA);
        await expect(funding.funderNameBoxes(addPanel).first()).toHaveValue(nameA);
        await expect(funding.funderField(addPanel)).toContainText('* Required');
        await expect(funding.funderSearchInput(addPanel)).toHaveCount(0);
        await funding.deleteChosenFunderButton(addPanel).click();
        await expect(funding.funderSearchInput(addPanel)).toBeVisible({timeout: 30_000});
        await expect(funding.funderNameBoxes(addPanel)).toHaveCount(0);
        await funding.pickTypedFunder(addPanel, nameA);
        await expect(funding.funderNameBoxes(addPanel).first()).toHaveValue(nameA);

        // The grants: one row with a malformed DOI is refused on the cell
        // with Save disabled; the DOI corrected, a blank second row added,
        // Save closes the panel and the row shows the funder (Fields;
        // Rule 5).
        await funding.addGrantRow(addPanel, {
            grantName: 'Field Study',
            grantNumber: '1234',
            grantDoi: 'not-a-doi',
        });
        await funding.saveRefused(addPanel, funding.grantDoiError(addPanel));
        await expect(funding.grantDoiError(addPanel)).toContainText(DOI_FORMAT);
        await addPanel.locator('input[name="grantDoi"]').last().fill('10.1234/example');
        await expect(funding.saveButton(addPanel)).toBeEnabled({timeout: 30_000});
        await funding.addGrantRow(addPanel);
        await expect(funding.grantRows(addPanel)).toHaveCount(2);
        await funding.savePanel(addPanel);
        await expect(funding.row(nameA)).toBeVisible({timeout: 30_000});

        // The registry funder: NIH's suggestion shows its country and the
        // ROR mark; picked, the panel shows the name and its registry link.
        // The install's copy lacks NIH and the test server cannot reach the
        // registry, so the pick's lookup is refused and the window "An
        // unexpected error has occurred…" opens (A3 🐞, footnote s1): it is
        // dismissed with "OK" and the funder saved; its row is the one with
        // the ROR mark, and nothing reads what it shows beside the mark
        // (M3). A copy that held NIH would answer the lookup and the row
        // would read its name (Fields; Rule 4).
        await funding.addFunderButton().click();
        const nihPanel = funding.dialog('Add Funder');
        await expect(nihPanel).toBeVisible({timeout: 30_000});
        const nihSuggestion = await funding.searchRegistry(nihPanel, NIH_NAME);
        await expect(nihSuggestion.locator('sub')).toHaveText('United States');
        await expect(nihSuggestion.locator('svg').first()).toBeVisible();
        await expect(nihSuggestion.locator(`a[href="${NIH_ROR}"]`)).toBeVisible();
        const nihLookup = await funding.pickRegistrySuggestion(nihSuggestion);
        if (!nihLookup.ok()) {
            await funding.dismissErrorWindow(funding.errorWindow(SEARCH_FAILED.unreachable.message));
        }
        await expect(funding.funderField(nihPanel)).toContainText(NIH_NAME, {timeout: 30_000});
        await expect(funding.funderField(nihPanel).locator(`a[href="${NIH_ROR}"]`).first()).toBeVisible();
        await funding.savePanel(nihPanel);
        await expect(funding.markedRows()).toHaveCount(1, {timeout: 30_000});
        if (nihLookup.ok()) {
            await expect(funding.markedRows().first()).toContainText(NIH_NAME);
        }
        // Control: the typed-name row beside it carries no ROR mark.
        await expect(funding.rorMark(nameA)).toHaveCount(0);
        await expect(funding.rows()).toHaveCount(2);
        await expect(funding.rows().nth(0)).toContainText(nameA);
        await expect(funding.rows().nth(1).getByRole('img')).toHaveCount(1);

        // Ordering: move the registry funder up with its arrow (the arrows
        // carry no name, A5 🐞, so the row's first button is "up"), save
        // the order, reload: the registry funder is still listed first
        // (Rule 7).
        await funding.orderButton().click();
        await expect(funding.saveOrderButton()).toBeVisible({timeout: 30_000});
        await funding.rows().nth(1).locator('button').first().click();
        const orderSaved = page.waitForResponse(
            (r) =>
                r.url().includes('/funders/order') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await funding.saveOrderButton().click();
        await orderSaved;
        funding = await openFunding(page, JOURNAL, submissionId);
        await expect(funding.rows()).toHaveCount(2, {timeout: 30_000});
        await expect(funding.rows().first().getByRole('img')).toHaveCount(1);
        await expect(funding.rows().nth(1)).toContainText(nameA);

        // Edit: the panel is titled "Edit Funder", prefilled with the name
        // and the one grant row, the blank second row gone; the grant
        // number changed and saved; reopened, "5678" is there; "Close"
        // (Fields; Rule 5).
        await funding.openRowAction(nameA, 'Edit');
        let editPanel = funding.dialog('Edit Funder');
        await expect(editPanel).toBeVisible({timeout: 30_000});
        await expect(funding.funderNameBoxes(editPanel).first()).toHaveValue(nameA);
        await expect(funding.grantRows(editPanel)).toHaveCount(1);
        await expect(editPanel.locator('input[name="grantName"]')).toHaveValue('Field Study');
        await expect(editPanel.locator('input[name="grantNumber"]')).toHaveValue('1234');
        await expect(editPanel.locator('input[name="grantDoi"]')).toHaveValue('10.1234/example');
        await editPanel.locator('input[name="grantNumber"]').fill('5678');
        await funding.savePanel(editPanel);

        // Persistence read on a fresh load (reopening the panel in the same
        // breath can prefill from the store's copy before its refetch of
        // the saved list lands).
        funding = await openFunding(page, JOURNAL, submissionId);
        await funding.openRowAction(nameA, 'Edit');
        editPanel = funding.dialog('Edit Funder');
        await expect(editPanel.locator('input[name="grantNumber"]')).toHaveValue('5678', {
            timeout: 30_000,
        });
        // The panel offers "Close" and "Save" and no "Cancel" (Rule 5).
        await expect(editPanel.getByRole('button', {name: 'Close', exact: true})).toBeVisible();
        await expect(funding.saveButton(editPanel)).toBeVisible();
        await expect(editPanel.getByRole('button', {name: 'Cancel', exact: true})).toHaveCount(0);
        await editPanel.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(editPanel).toHaveCount(0, {timeout: 30_000});

        // Delete, on the registry funder: the confirmation's question;
        // Cancel leaves the row; OK removes it and the typed-name funder
        // alone remains (Rule 6).
        await funding.openRowActionOn(funding.markedRows().first(), 'Delete');
        let confirm = funding.deleteConfirmDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await expect(confirm).toContainText(
            'Are you sure you wish to delete this item? This action cannot be undone.'
        );
        await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(confirm).toHaveCount(0, {timeout: 30_000});
        await expect(funding.markedRows()).toHaveCount(1);
        await expect(funding.rows()).toHaveCount(2);

        await funding.openRowActionOn(funding.markedRows().first(), 'Delete');
        confirm = funding.deleteConfirmDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        const deleted = page.waitForResponse(
            (r) =>
                r.url().includes('/funders/') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await confirm.getByRole('button', {name: 'OK', exact: true}).click();
        await deleted;
        await expect(funding.markedRows()).toHaveCount(0, {timeout: 30_000});
        await expect(funding.row(nameA)).toBeVisible();
        await expect(funding.rows()).toHaveCount(1);

        // A registry search that fails (footnote s1): for each failing
        // state, "Natural Sciences" typed in a fresh search opens its
        // window over the panel; "OK", then "Delete" under the chosen
        // funder brings the search box back. What stood in the name box
        // behind the window is A16 ❓ and is not read (Fields).
        const dialogs = page.getByRole('dialog');
        const dialogsBefore = await dialogs.count();
        await funding.addFunderButton().click();
        const searchPanel = funding.dialog('Add Funder');
        await expect(searchPanel).toBeVisible({timeout: 30_000});
        for (const state of /** @type {const} */ (['unreachable', 'unavailable', 'tooMany'])) {
            registry.fail(state);
            await funding.typeSearch(searchPanel, 'Natural Sciences');
            const failed = funding.errorWindow(SEARCH_FAILED[state].message);
            await expect(failed).toBeVisible({timeout: 30_000});
            await expect(failed).toContainText(SEARCH_FAILED[state].title);
            await expect(searchPanel).toBeVisible();
            await funding.dismissErrorWindow(failed);
            await funding.deleteChosenFunderButton(searchPanel).click();
            await expect(funding.funderSearchInput(searchPanel)).toBeVisible({timeout: 30_000});
        }
        // With the registry answering again, the full name brings NSERC's
        // suggestion with its country and the ROR mark (Fields).
        registry.answer();
        const answered = await funding.searchRegistry(searchPanel, NSERC_NAME);
        await expect(answered.locator('sub')).toHaveText('Canada');
        await expect(answered.locator('svg').first()).toBeVisible();
        await expect(answered.locator(`a[href="${NSERC_ROR}"]`)).toBeVisible();
        await expect(funding.errorWindow(/An unexpected error has occurred|ROR API Error/)).toHaveCount(0);

        // An unsaved funder dropped: picked, the panel shows the name and
        // its registry link; "Close" asks nothing: the panel goes, the
        // page's windows are back to the count before "Add Funder", no
        // window offers an "OK" or "Cancel" (the delete confirmation above
        // was found by the same buttons), no browser prompt was raised, and
        // the list still shows the typed-name funder alone (Rule 5).
        const unsavedLookup = await funding.pickRegistrySuggestion(answered);
        expect(unsavedLookup.status()).toBe(200);
        await expect(funding.funderField(searchPanel)).toContainText(NSERC_NAME, {timeout: 30_000});
        await expect(
            funding.funderField(searchPanel).locator(`a[href="${NSERC_ROR}"]`).first()
        ).toBeVisible();
        await searchPanel.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(searchPanel).toHaveCount(0, {timeout: 30_000});
        await expect(dialogs).toHaveCount(dialogsBefore);
        await expect(
            dialogs.getByRole('button', {name: /^(OK|Cancel)$/})
        ).toHaveCount(0);
        await expect(funding.rows()).toHaveCount(1);
        await expect(funding.row(nameA)).toBeVisible();
        await expect(funding.row(NSERC_NAME)).toHaveCount(0);
        expect(asked).toEqual([]);

        // "Add Funder" opens empty: the search box blank, no name box, no
        // registry link, no grant row (the same reads held a value above).
        await funding.addFunderButton().click();
        const emptyPanel = funding.dialog('Add Funder');
        await expect(emptyPanel).toBeVisible({timeout: 30_000});
        await expect(funding.funderSearchInput(emptyPanel)).toHaveValue('');
        await expect(funding.funderNameBoxes(emptyPanel)).toHaveCount(0);
        await expect(funding.funderField(emptyPanel).locator('a[href^="https://ror.org/"]')).toHaveCount(0);
        await expect(emptyPanel.locator('input[name="grantNumber"]')).toHaveCount(0);

        // A typed name picked, the page reloaded with the panel open:
        // nothing is asked, and after the reload the list still shows the
        // typed-name funder alone (Rule 5).
        await funding.pickTypedFunder(emptyPanel, nameUnsaved);
        await expect(funding.funderNameBoxes(emptyPanel).first()).toHaveValue(nameUnsaved);
        await page.reload();
        await expect(funding.row(nameA)).toBeVisible({timeout: 30_000});
        await expect(funding.rows()).toHaveCount(1);
        await expect(funding.row(nameUnsaved)).toHaveCount(0);
        await expect(funding.dialog('Add Funder')).toHaveCount(0);
        expect(asked).toEqual([]);

        // A registry funder the install already holds: NSERC's suggestion
        // shows its country and the ROR mark with its registry link; the
        // pick is answered from the install's copy (no error window, on a
        // server that cannot reach the registry); Save closes the panel and
        // the list shows the registry name with the ROR mark beside it
        // (Fields).
        await funding.addFunderButton().click();
        const registryPanel = funding.dialog('Add Funder');
        await expect(registryPanel).toBeVisible({timeout: 30_000});
        const suggestion = await funding.searchRegistry(registryPanel, NSERC_NAME);
        await expect(suggestion.locator('sub')).toHaveText('Canada');
        await expect(suggestion.locator('svg').first()).toBeVisible();
        await expect(suggestion.locator(`a[href="${NSERC_ROR}"]`)).toBeVisible();
        const lookedUp = await funding.pickRegistrySuggestion(suggestion);
        expect(lookedUp.status()).toBe(200);
        await expect(funding.funderField(registryPanel)).toContainText(NSERC_NAME, {timeout: 30_000});
        await expect(
            funding.funderField(registryPanel).locator(`a[href="${NSERC_ROR}"]`).first()
        ).toBeVisible();
        await expect(funding.funderNameBoxes(registryPanel)).toHaveCount(0);
        await expect(page.getByRole('dialog', {name: 'Error', exact: true})).toHaveCount(0);
        await funding.savePanel(registryPanel);
        await expect(funding.row(NSERC_NAME)).toBeVisible({timeout: 30_000});
        await expect(funding.rorMark(NSERC_NAME)).toHaveCount(1);
        // Control: the typed-name row beside it carries no ROR mark.
        await expect(funding.rorMark(nameA)).toHaveCount(0);
        await expect(funding.rows()).toHaveCount(2);

        // Nothing else happens: the Activity Log has no new entry from the
        // adds, edits, deletes and reorders (Side effects) …
        expect(await activityLogRowCount(pub)).toBe(logBefore);

        // Control: a Title & Abstract save on this same submission writes
        // one "Submission metadata updated" entry.
        await pub.openEntry('Title & Abstract');
        await pub.setRichText('titleAbstract-subtitle-control-en', `Control ${tag}`);
        await pub.save();
        expect(await activityLogRowCount(pub)).toBe(logBefore + 1);

        // … and no email arrived in the mail catcher for the submitter,
        // read after the control mail the test sends the same way (A8).
        await expectNoMailToSubmitter(page, pkpMail, {
            tag,
            controlSubmissionId: control.submissionId,
            author,
            spare,
        });

        // The list in French: the same "Funding" screen with "/fr_CA" in
        // place of "/en" in its address (Rule 14; footnote i).
        funding = await openFunding(page, JOURNAL, submissionId);
        const englishUrl = page.url();
        expect(englishUrl).toContain(`/${JOURNAL}/en/`);
        await page.goto(englishUrl.replace(`/${JOURNAL}/en/`, `/${JOURNAL}/fr_CA/`));
        await expect(funding.anyRow(nameA)).toBeVisible({timeout: 30_000});

        // "Order" reads "Trier"; pressed, it relabels "Enregistrer
        // l'ordre"; that pressed saves the order as it stands (Rule 7).
        await expect(funding.topButton(FR.order)).toBeVisible();
        await funding.topButton(FR.order).click();
        await expect(funding.topButton(FR.saveOrder)).toBeVisible({timeout: 30_000});
        await expect(funding.topButton(FR.order)).toHaveCount(0);
        const frOrderSaved = page.waitForResponse(
            (r) =>
                r.url().includes('/funders/order') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await funding.topButton(FR.saveOrder).click();
        await frOrderSaved;
        await expect(funding.topButton(FR.order)).toBeVisible({timeout: 30_000});

        // The row menu reads French: its two entries; the second opens the
        // delete confirmation in French; its cancel button leaves "Test
        // Foundation" listed (Rules 6, 14).
        await funding.anyRowMenuButton(nameA).click();
        const frItems = page.getByRole('menuitem');
        await expect(frItems).toHaveText(FR.menu, {timeout: 30_000});
        await frItems.nth(1).click();
        const frConfirm = page.getByRole('dialog').filter({hasText: FR.confirm});
        await expect(frConfirm).toBeVisible({timeout: 30_000});
        await expect(frConfirm).toContainText(FR.confirmTitle);
        await expect(frConfirm.getByRole('button', {name: FR.ok, exact: true})).toBeVisible();
        await frConfirm.getByRole('button', {name: FR.cancel, exact: true}).click();
        await expect(frConfirm).toHaveCount(0, {timeout: 30_000});
        await expect(funding.anyRow(nameA)).toBeVisible();

        // The other button above the table opens the panel; the typed
        // text picked, the panel's "Add" under the grants, "Save", "Close"
        // and the "Delete" under the chosen funder read French; the
        // pre-filled box left as it is, the French "Save" closes the panel
        // and the funder is listed at once (no position asserted, A7) and
        // after a reload (Rule 14).
        await funding.addButtonBeside(FR.order).click();
        const frPanel = funding.anyPanel();
        await expect(frPanel).toBeVisible({timeout: 30_000});
        await funding.pickTypedFunder(frPanel, nameFr);
        await expect(funding.funderNameBoxes(frPanel).first()).toHaveValue(nameFr);
        await expect(frPanel.getByRole('button', {name: FR.add, exact: true})).toBeVisible();
        await expect(frPanel.getByRole('button', {name: FR.save, exact: true})).toBeVisible();
        await expect(frPanel.getByRole('button', {name: FR.close, exact: true})).toBeVisible();
        await expect(funding.deleteChosenFunderButton(frPanel, FR.deleteChosen)).toBeVisible();
        await funding.savePanel(frPanel, {saveLabel: FR.save});
        await expect(funding.anyRow(nameFr)).toBeVisible({timeout: 30_000});
        await page.reload();
        await expect(funding.anyRow(nameA)).toBeVisible({timeout: 30_000});
        await expect(funding.anyRow(nameFr)).toBeVisible();
        await expect(funding.topButton(FR.order)).toBeVisible();
    });

    test('S2: declare funding while submitting', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        // The given: the install's copy of the registry holds NSERC
        // (footnote s2, as s1).
        const [{submissionId}] = await Promise.all([
            ojsApi.createSubmission({
                tag,
                context: JOURNAL,
                submitter: 'author.alex',
                title: `Submission ${tag}`,
                submitted: false,
            }),
            ojsApi.setSite({rors: [NSERC]}),
        ]);
        const funderName = `Test Foundation ${tag}`;

        // The author walks the wizard to Details; the journal sits at the
        // default "ask" level, so the step carries the funders list. The
        // browser-side registry search answers with NSERC's record.
        const authorPage = await (await asUser('author.alex')).newPage();
        await stubRegistrySearch(authorPage, [NSERC]);
        const wizard = new SubmissionWizardPage(authorPage, JOURNAL);
        await wizard.goto(submissionId);
        await wizard.expectStep('Upload Files');
        await wizard.uploadFile();
        await wizard.continueTo('Details');

        // The Details step: its last section is headed "Funding" and holds
        // the funders list (Rule 10) and, the control, its table reads "No
        // funders have been added." before the add (Rules 3, 10).
        const wizardFunding = new FundingScreen(authorPage);
        await expect(wizardFunding.table()).toBeVisible({timeout: 30_000});
        await expect(wizardFunding.wizardFundersSection()).toHaveCount(1);
        await expect(wizardFunding.wizardFundingHeading()).toBeVisible();
        await expect(wizardFunding.wizardSections().last().getByRole('table', {name: 'Funders', exact: true})).toBeVisible();
        await expect(wizardFunding.table()).toContainText(EMPTY_LIST);

        // Record scenario 1's typed-name funder: on OJS the section's table
        // shows its row at once (the stale table is A4's, a press and
        // preprint-server matter).
        await wizardFunding.addFunder(funderName);
        await expect(wizardFunding.row(funderName)).toBeVisible();
        await expect(wizardFunding.table()).not.toContainText(EMPTY_LIST);

        // A registry funder the install already holds: NSERC's suggestion
        // with its country and the ROR mark, picked (answered from the
        // install's copy) and saved: the section's table shows its name
        // (Fields; Rule 10).
        await wizardFunding.addFunderButton().click();
        const panel = wizardFunding.dialog('Add Funder');
        await expect(panel).toBeVisible({timeout: 30_000});
        const suggestion = await wizardFunding.searchRegistry(panel, NSERC_NAME);
        await expect(suggestion.locator('sub')).toHaveText('Canada');
        await expect(suggestion.locator('svg').first()).toBeVisible();
        await expect(suggestion.locator(`a[href="${NSERC_ROR}"]`)).toBeVisible();
        const lookedUp = await wizardFunding.pickRegistrySuggestion(suggestion);
        expect(lookedUp.status()).toBe(200);
        await expect(wizardFunding.funderField(panel)).toContainText(NSERC_NAME, {timeout: 30_000});
        await wizardFunding.savePanel(panel);
        await expect(wizardFunding.row(NSERC_NAME)).toBeVisible({timeout: 30_000});
        await expect(wizardFunding.rows()).toHaveCount(2);

        // The Review step lists both funders' names under "Details", the
        // submit offered (the control of S4's grayed "Submit"); complete
        // the submission (Fields; Rule 10).
        await wizard.continueTo('Contributors');
        await wizard.continueTo('For the Editors');
        await wizard.continueToReview(submissionId);
        await expect(wizard.reviewPanel('Details')).toContainText('Funders');
        await expect(wizard.reviewPanel('Details')).toContainText(funderName);
        await expect(wizard.reviewPanel('Details')).toContainText(NSERC_NAME);
        await expect(wizard.submitButton()).toBeEnabled();
        await wizard.submitAndConfirm();

        // The Journal Manager's list: both of the author's funders are on
        // the new submission's Funding screen (Rule 1: one list per
        // submission).
        const managerPage = await (await asUser('manager.maya')).newPage();
        const funding = await openFunding(managerPage, JOURNAL, submissionId);
        await expect(funding.row(funderName)).toBeVisible({timeout: 30_000});
        await expect(funding.row(NSERC_NAME)).toBeVisible();
        await expect(funding.rows()).toHaveCount(2);
    });

    test('S3: read a published article\'s funding', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const controlTag = `${tag}c`;
        const [withFunder, noFunder] = await Promise.all([
            ojsApi.createSubmission({
                tag,
                context: JOURNAL,
                submitter: 'author.alex',
                title: `Submission ${tag}`,
                decisions: ['skipExternalReview', 'sendToProduction'],
                published: true,
            }),
            ojsApi.createSubmission({
                tag: controlTag,
                context: JOURNAL,
                submitter: 'author.alex',
                title: `Submission ${controlTag}`,
                decisions: ['skipExternalReview', 'sendToProduction'],
                published: true,
            }),
            ojsApi.setSite({rors: [NSERC]}),
        ]);
        const testFoundation = `Test Foundation ${tag}`;
        const secondFoundation = `Second Foundation ${tag}`;
        const grantName = 'Field Study';
        const grantNumber = '1234';
        const grantDoi = '10.1234/example';

        // The manager records the two hand-named funders on the published
        // item (publishing does not lock the list — Actors & permissions),
        // the first with its grant, and the registry funder the install's
        // copy holds (NSERC, the browser-side search answered with its
        // record), then orders "Second Foundation" first with "Order" /
        // "Save Order" (footnote s3).
        const managerPage = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(managerPage, [NSERC]);
        let funding = await openFunding(managerPage, JOURNAL, withFunder.submissionId);
        await funding.addFunder(testFoundation, {
            grants: [{grantName, grantNumber, grantDoi}],
        });
        await funding.addFunder(secondFoundation);
        await funding.addFunderButton().click();
        const registryPanel = funding.dialog('Add Funder');
        await expect(registryPanel).toBeVisible({timeout: 30_000});
        const suggestion = await funding.searchRegistry(registryPanel, NSERC_NAME);
        const lookedUp = await funding.pickRegistrySuggestion(suggestion);
        expect(lookedUp.status()).toBe(200);
        await funding.savePanel(registryPanel);
        await expect(funding.row(NSERC_NAME)).toBeVisible({timeout: 30_000});
        await orderFirst(managerPage, funding, secondFoundation);
        funding = await openFunding(managerPage, JOURNAL, withFunder.submissionId);
        await expect(funding.rows().first()).toContainText(secondFoundation, {timeout: 30_000});
        await expect(funding.rows()).toHaveCount(3);

        // The "Funders" block: the anonymous reader's landing page lists
        // "Test Foundation" with its grant's name, "Grant Number" and the
        // number, "Grant DOI" and the DOI as a working link (Rule 9).
        await page.goto(`/index.php/${JOURNAL}/article/view/${withFunder.submissionId}`);
        const landing = landingFunders(page);
        await expect(landing.heading).toBeVisible({timeout: 30_000});
        await expect(landing.block).toContainText(testFoundation);
        await expect(landing.block).toContainText(grantName);
        await expect(landing.block).toContainText(`Grant Number ${grantNumber}`);
        await expect(landing.block).toContainText('Grant DOI');
        const doiLink = landing.block.getByRole('link', {name: `https://doi.org/${grantDoi}`});
        await expect(doiLink).toHaveAttribute('href', `https://doi.org/${grantDoi}`);

        // The saved order: "Second Foundation" is listed before "Test
        // Foundation" (Rule 7).
        await expect(landing.funderNames).toHaveCount(3);
        await expect(landing.funderNames.nth(0)).toContainText(secondFoundation);
        await expect(landing.funderNames.nth(1)).toContainText(testFoundation);

        // The registry funder: its name shows beside its ROR mark, and the
        // mark links to its record on the registry site (Fields; Rule 9).
        // Control: a hand-named funder's entry carries no such link.
        const registryEntry = landing.funderNames.filter({hasText: NSERC_NAME});
        await expect(registryEntry).toHaveCount(1);
        await expect(registryEntry).toContainText(NSERC_NAME);
        const markLink = registryEntry.locator(`a[href="${NSERC_ROR}"]`);
        await expect(markLink).toHaveCount(1);
        await expect(markLink.locator('svg')).toHaveCount(1);
        await expect(markLink.locator('svg')).toBeVisible();
        await expect(
            landing.funderNames.filter({hasText: testFoundation}).locator('a[href^="https://ror.org/"]')
        ).toHaveCount(0);

        // Control: the published article with no funders shows no
        // "Funders" section at all — bounded by the page having rendered
        // (its title), the same way the presence leg was read (Rule 9).
        await page.goto(`/index.php/${JOURNAL}/article/view/${noFunder.submissionId}`);
        await expect(
            page.getByRole('heading', {name: `Submission ${controlTag}`})
        ).toBeVisible({timeout: 30_000});
        await expect(landingFunders(page).block).toHaveCount(0);
    });

    test('S4: the journal opts out', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(420_000);
        const tag = makeTag('s4', testInfo);
        // Scratch journal (the setting is mutated) with throwaway users; a
        // published scratch submission (the landing-page read needs a
        // page) and the throwaway Author's draft (footnote s4).
        const {manager, author} = await seedJournal(ojsApi, tag);
        const [{submissionId}, draft] = await Promise.all([
            ojsApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: author,
                title: `Submission ${tag}s`,
                decisions: ['skipExternalReview', 'sendToProduction'],
                published: true,
            }),
            ojsApi.createSubmission({
                tag: `${tag}d`,
                context: tag,
                submitter: author,
                title: `Submission ${tag}d`,
                submitted: false,
            }),
        ]);
        const funderName = `Test Foundation ${tag}`;

        // Control (and the funder every later read rides on): while the
        // journal sits at its "Ask…" start, the published submission's
        // Publication area shows "Funding" (openFunding opens it) and the
        // manager records the funder there (Rule 2).
        const managerPage = await (await asUser(manager)).newPage();
        await stubRegistrySearch(managerPage);
        let funding = await openFunding(managerPage, tag, submissionId);
        await funding.addFunder(funderName);

        // Control: the Author's draft, its file uploaded (footnote s4: at
        // "Require" the funders warning must be the only notice), walked to
        // the Details step, ends with its Funders section (Rule 2).
        const authorPage = await (await asUser(author)).newPage();
        await stubRegistrySearch(authorPage);
        const wizard = new SubmissionWizardPage(authorPage, tag);
        const wizardFunding = new FundingScreen(authorPage);
        await wizard.goto(draft.submissionId);
        await wizard.expectStep('Upload Files');
        await wizard.uploadFile();
        await wizard.continueTo('Details');
        await expect(wizardFunding.wizardFundersSection()).toHaveCount(1);
        await expect(wizardFunding.wizardSections().last()).toContainText('Funders');

        // The setting off: untick "Enable funder metadata" and save: the
        // workflow's Publication area offers no "Funding" entry — bounded
        // by its sibling "Title & Abstract" entry rendering (Rule 2).
        await openMetadataSettings(managerPage, tag);
        await managerPage.getByRole('checkbox', {name: 'Enable funder metadata'}).uncheck();
        await saveMetadataSettings(managerPage);
        // (A published item's workflow opens on a Publication page with no
        // "Workflow:" heading, so the open waits on the Publication menu.)
        await new PublicationScreen(managerPage, tag).gotoWorkflow(submissionId);
        const noFunding = new FundingScreen(managerPage);
        await expect(
            managerPage.getByRole('link', {name: 'Title & Abstract', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(noFunding.fundingMenuLink()).toHaveCount(0);

        // The wizard with the setting off: the Details step carries no
        // Funders section — bounded by the step being current with its
        // other sections on screen (Rule 2).
        await reopenAtDetails(wizard, draft.submissionId);
        await expect(wizardFunding.wizardSections().first()).toBeVisible({timeout: 30_000});
        await expect(wizardFunding.wizardFundersSection()).toHaveCount(0);

        // The published page with the setting off: the landing page still
        // lists the funder (Rule 2; Rule 9).
        await page.goto(`/index.php/${tag}/article/view/${submissionId}`);
        const landing = landingFunders(page);
        await expect(landing.heading).toBeVisible({timeout: 30_000});
        await expect(landing.funderNames).toHaveText([funderName]);

        // The setting on again: re-tick and save on "Do not request…"
        // (picked here, whatever arrived preselected — A8 ❓ stays
        // unasserted): Rule 2's enabled level — the "Funding" entry is
        // back and the Author's Details step still has no Funders section.
        await openMetadataSettings(managerPage, tag);
        await managerPage.getByRole('checkbox', {name: 'Enable funder metadata'}).check();
        await managerPage
            .getByRole('radio', {
                name: 'Do not request funder metadata from the author during submission.',
            })
            .check();
        await saveMetadataSettings(managerPage);
        funding = await openFunding(managerPage, tag, submissionId);
        await expect(funding.row(funderName)).toBeVisible({timeout: 30_000});
        await reopenAtDetails(wizard, draft.submissionId);
        await expect(wizardFunding.wizardSections().first()).toBeVisible({timeout: 30_000});
        await expect(wizardFunding.wizardFundersSection()).toHaveCount(0);

        // "Ask" again: both surfaces are back, the "Funding" entry with its
        // funder intact and the Funders section on the Details step (Rule 2).
        await openMetadataSettings(managerPage, tag);
        await managerPage
            .getByRole('radio', {name: 'Ask the author for funder metadata during submission.'})
            .check();
        await saveMetadataSettings(managerPage);
        funding = await openFunding(managerPage, tag, submissionId);
        await expect(funding.row(funderName)).toBeVisible({timeout: 30_000});
        await reopenAtDetails(wizard, draft.submissionId);
        await expect(wizardFunding.wizardFundersSection()).toBeVisible({timeout: 30_000});
        await expect(wizardFunding.table()).toContainText(EMPTY_LIST);

        // "Require": pick the require level and save (Settings).
        await openMetadataSettings(managerPage, tag);
        await managerPage
            .getByRole('radio', {
                name: 'Require the author to add funder metadata before accepting their submission.',
            })
            .check();
        await saveMetadataSettings(managerPage);

        // The Review step at "Require": the draft (started before the
        // untick, its file uploaded), with no funder declared, walked on to
        // Review shows "Funders are required." under "Details", the
        // problems notice, and "Submit" grayed out (Rule 11; the enabled
        // "Submit" of S2's Review step is the control).
        await reopenAtDetails(wizard, draft.submissionId);
        await wizard.continueTo('Contributors');
        await wizard.continueTo('For the Editors');
        await wizard.continueToReview(draft.submissionId);
        await expect(wizardFunding.fundersRequiredWarning()).toBeVisible({timeout: 30_000});
        await expect(wizardFunding.fundersRequiredWarning()).toContainText(FUNDERS_REQUIRED);
        await expect(wizard.reviewPanel('Details')).toContainText(FUNDERS_REQUIRED);
        await expect(wizard.reviewPanel('Details')).toContainText('Funders');
        await expect(wizard.errorBanner()).toBeVisible();
        await expect(authorPage.getByText(PROBLEMS_NOTICE)).toBeVisible();
        await expect(wizard.submitButton()).toBeVisible();
        await expect(wizard.submitButton()).toBeDisabled();
    });

    test('S5: the read-only list', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });
        const funderName = `Test Foundation ${tag}`;

        // Control (Rule 8's editable side): the Journal Manager records the
        // funder and their "Funding" on the same submission offers "Add
        // Funder", "Order" and the row's "…" menu with "Edit" and "Delete"
        // (Rules 3, 4).
        const managerPage = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(managerPage);
        const managerFunding = await openFunding(managerPage, JOURNAL, submissionId);
        await managerFunding.addFunder(funderName);
        await expect(managerFunding.addFunderButton()).toBeEnabled();
        await expect(managerFunding.orderButton()).toBeEnabled();
        await expect(managerFunding.rowMoreActions(funderName)).toBeVisible();
        const items = await managerFunding.openRowMenu(funderName);
        await expect(items).toHaveText(['Edit', 'Delete']);
        await managerFunding.closeRowMenu();

        // The Author's list: the same list on the Author's own submission
        // shows the row with "Add Funder" and "Order" grayed out and no "…"
        // menu on the row (Rule 8; Actors row 2; the editable author is
        // OPS1's, a preprint-server matter).
        const authorPage = await (await asUser('author.alex')).newPage();
        const authorFunding = await openFunding(authorPage, JOURNAL, submissionId, {
            author: true,
        });
        await expect(authorFunding.row(funderName)).toBeVisible({timeout: 30_000});
        await expect(authorFunding.rows()).toHaveCount(1);
        await expect(authorFunding.addFunderButton()).toBeDisabled();
        await expect(authorFunding.orderButton()).toBeDisabled();
        await expect(authorFunding.rowMoreActions(funderName)).toHaveCount(0);
    });

    test('S6: the reviewer\'s browser never receives the funders list', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s6', testInfo);
        // Two scratch journals: one at the install defaults ("Anonymous
        // Reviewer/Anonymous Author"), one whose default review type is
        // "Open"; each with a submission in review, the Reviewer's accepted
        // request on it and one hand-named funder recorded through the
        // workflow panel by the journal's manager (footnote s6).
        const seedJournalInReview = async (path, options) => {
            const {manager, reviewer, author} = await seedJournal(ojsApi, path, {
                reviewer: true,
                ...options,
            });
            const {submissionId} = await ojsApi.createSubmission({
                tag: `${path}s`,
                context: path,
                submitter: author,
                title: `Submission ${path}s`,
                decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [{username: reviewer, status: 'accepted'}]}],
            });
            const funderName = `Test Foundation ${path}`;
            const managerPage = await (await asUser(manager)).newPage();
            await stubRegistrySearch(managerPage);
            const funding = await openFunding(managerPage, path, submissionId);
            await funding.addFunder(funderName);

            // Control (Rules 1, 3): the manager's "Funding" on the same
            // submission, reopened, shows the "Test Foundation" row, and
            // the screen's own request for the submission
            // (`GET …/api/v1/submissions/{id}`, the workflow's fetch on
            // opening — the page's own traffic, read with a listener armed
            // before the open) carries the name.
            const submissionFetched = managerPage.waitForResponse(
                (r) =>
                    new RegExp(`/api/v1/submissions/${submissionId}(\\?|$)`).test(r.url()) &&
                    r.request().method() === 'GET' &&
                    r.ok(),
                {timeout: 30_000}
            );
            const reopened = await openFunding(managerPage, path, submissionId);
            await expect(reopened.row(funderName)).toBeVisible({timeout: 30_000});
            const submissionPayload = await (await submissionFetched).text();
            expect(submissionPayload).toContain(funderName);
            await managerPage.close();
            return {path, reviewer, submissionId, funderName};
        };
        const [anonymous, open] = await Promise.all([
            seedJournalInReview(`${tag}a`),
            seedJournalInReview(`${tag}o`, {review: {defaultReviewMode: 'open'}}),
        ]);

        /**
         * As the Reviewer, open the request from the reviewer dashboard:
         * the review screen shows no funders list (bounded by the review
         * page's own heading), and the publication the page fetches for
         * "View All Submission Details" (`GET …/submissions/{id}/
         * publications/{id}`, the page's own traffic — the shape U41's
         * S11 reads) is returned for the payload reads below.
         */
        const fetchedPublication = async ({path, reviewer, submissionId, funderName}) => {
            const page = await (await asUser(reviewer)).newPage();
            const list = new ReviewerAssignmentsPage(page, path);
            await list.goto('actionRequired');
            const row = list.row(`Submission ${path}s`);
            await expect(row).toBeVisible({timeout: 30_000});
            await list.openWizard(row, 'Finish review');
            const wizard = new ReviewWizardPage(page, path);
            await wizard.expectOpen();
            await expect(page.getByRole('table', {name: 'Funders', exact: true})).toHaveCount(0);
            await expect(page.getByText(funderName)).toHaveCount(0);
            const fetched = page.waitForResponse(
                (r) =>
                    r.url().includes(`/submissions/${submissionId}/publications/`) &&
                    r.request().method() === 'GET' &&
                    r.ok(),
                {timeout: 30_000}
            );
            const details = await wizard.openSubmissionDetails();
            const publication = await (await fetched).json();
            await expect(details).not.toContainText(funderName);
            await wizard.closeDialog(details);
            return publication;
        };

        // The anonymous assignment: the publication the window requests
        // has no funders list, not even an empty one (no `funders` key),
        // and the funder's name appears nowhere in it (Rule 13; footnote
        // s6). The control is the manager's submission request above,
        // which carries the name.
        const withheld = await fetchedPublication(anonymous);
        expect(Object.keys(withheld).length).toBeGreaterThan(0);
        expect('funders' in withheld).toBe(false);
        expect(JSON.stringify(withheld)).not.toContain(anonymous.funderName);

        // The open assignment: the same walk — the screen and the window
        // show no funders list (fetchedPublication asserts both), and the
        // publication the window requests likewise carries no funders list
        // (Rule 13; the funders list lives on the submission payload, which
        // no reviewer screen requests — T-ojs-1). The contributor reads are
        // extra evidence that the open payload is the un-anonymized one.
        const full = await fetchedPublication(open);
        expect('funders' in full).toBe(false);
        expect(JSON.stringify(full)).not.toContain(open.funderName);
        expect(withheld.authors).toEqual([]);
        expect(full.authors).toHaveLength(1);
        expect(full.authors[0].fullName).toBe('Ada Author');
        const facts = testInfo.outputPath('publication-payload-facts.json');
        fs.writeFileSync(
            facts,
            JSON.stringify(
                {
                    anonymous: {
                        hasFundersKey: 'funders' in withheld,
                        funders: withheld.funders ?? null,
                        authors: withheld.authors,
                    },
                    open: {
                        hasFundersKey: 'funders' in full,
                        funders: full.funders ?? null,
                        authors: full.authors.map((a) => a.fullName),
                    },
                },
                null,
                2
            )
        );
        await testInfo.attach('publication-payload-facts', {path: facts, contentType: 'application/json'});
    });
});
