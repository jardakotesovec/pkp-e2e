// @ts-check
/**
 * @file playwright/tests/U43-funding.spec.js
 *
 * Funding — OPS suite, one test per canonical COMMON scenario as a preprint
 * server runs it (S1–S5, in OPS vocabulary: preprint server, preprint, the
 * posted preprint's page; the workflow's Publication-area nav group is
 * labeled "Preprint" and its page is headed "Preprint: Funding" — Rule 3)
 * with S5's preprint-server end (OPS1 ✅: the submitting author EDITS their
 * own not-yet-posted preprint's funders, where a journal's or press's
 * author sees a read-only list). S6 is {OJS OMP}: a preprint server
 * installs no review stage, so it has no S6 test and no absence test
 * either. Every bold lead of a scenario has its assertion here; a bullet
 * the register marks carries only the scenario's own sentence.
 * Spec: docs/specs/U43-funding.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * A2 ❓, A3 🐞, A4 🐞, A5 🐞, A6 ❓, A7 ❓, A8 ❓, A10 ❓, A11 ❓, A12 ❓,
 * A15 🐞, A16 ❓.
 *
 * Hermeticity: the Funder field queries the public ROR registry from the
 * BROWSER; the suite stubs that query (FundingPages.stubRegistrySearch) so
 * no test depends on api.ror.org: a query is answered with the records
 * whose names it matches and an empty set otherwise (the typed-text
 * option renders independently of the suggestions payload). The records
 * are NSERC (`fixtures/ror-nserc-v2.json`), the registry funder the
 * install's copy holds, which S1, S2 and S3 seed into that copy with
 * `POST site` `rors` (scenarios.md "`rors`": a parallel test seeds only
 * the record its own pick reads), and NIH (`fixtures/ror-nih-v2.json`),
 * S1's registry funder, which the copy lacks: its pick may raise A3's
 * window, which S1 dismisses without reading, and its row is found by its
 * ROR mark, never by what stands beside it (footnote s1). S1's
 * failed-search leg answers the same query with a dropped connection, a
 * 503 and a 429 (footnote s1).
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only at the server level — S1, S2, S3 and S5 mutate only their
 * own seeded submissions there (S1's Author is a throwaway account created
 * on a scratch server, for the mailbox read's scoping); S4's settings
 * mutation runs on a scratch preprint server with throwaway users. There is
 * no funder seeding key — the add/edit panel IS the surface under test, so
 * funders are always recorded through it. S1 also adds one record to the
 * install's site-wide registry copy (`POST site` `rors`, idempotent, never
 * removed; no other test reads that record's absence; S2 and S3 send the
 * same record). S1's French read
 * runs in a fresh sign-in of its own (a `/fr_CA/` visit switches the
 * session's language, patterns.md parallel lesson 9, which the cached
 * session would leak). Waits are event-based (funders
 * API responses, form-save responses, web-first assertions) — no
 * hard-coded sleeps. Every absence read is bounded by a positive control
 * taken the same way (PRINCIPLES M4, M6; the mailbox read by the discussion
 * mail the test itself causes, A8; the Activity Log read by the "Title &
 * Abstract" save the test makes). Everything runs in the parallel `ops`
 * project.
 */
const path = require('path');
const {test, expect} = require('../support/fixtures.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {getPassword} = require('../../../../shared/playwright/data/users.js');
const {FundingScreen, stubRegistrySearch} = require('../pages/FundingPages.js');
const {
    PublicationScreen,
    openWorkflow,
    activityLogCounts,
    sendMailControl,
} = require('../pages/PublicationPages.js');
const {
    STEPS,
    SUBMIT_DIALOGS,
    wizardUrl,
    currentRailStep,
    expectWizardOpen,
    expectStep,
    continueTo,
    addGalleyFile,
    setRelationStatus,
    openReview,
    problemsBanner,
    reviewPanel,
    confirmSubmit,
    submitButton,
} = require('../pages/SubmissionWizardPages.js');

const PK = 'publicknowledge';
const PK_PREFIX = '/en';
const LEVELS = {
    noRequest: 'Do not request funder metadata from the author during submission.',
    request: 'Ask the author for funder metadata during submission.',
    require: 'Require the author to add funder metadata before accepting their submission.',
};
const NO_FUNDERS = 'No funders have been added.';
// The registry funder the install's registry copy holds (footnote s1): its
// ROR API v2 record, seeded into the copy and answering the browser-side
// search.
// eslint-disable-next-line import/no-dynamic-require
const NSERC_RECORD = require(path.join(__dirname, '..', 'fixtures', 'ror-nserc-v2.json'));
const NSERC = 'Natural Sciences and Engineering Research Council of Canada';
const NSERC_ROR = 'https://ror.org/01h531d29';
// The registry funder the install's copy lacks (footnote s1): its ROR API
// v2 record answers the browser-side search only.
// eslint-disable-next-line import/no-dynamic-require
const NIH_RECORD = require(path.join(__dirname, '..', 'fixtures', 'ror-nih-v2.json'));
const NIH = 'National Institutes of Health';
const NIH_ROR = 'https://ror.org/01cwqze88';
const REGISTRY_RECORDS = [NSERC_RECORD, NIH_RECORD];
// The failed-search leg's registry states and the windows they open
// (footnote s1; fn d).
const REGISTRY_FAILURES = [
    {
        fail: 'unreachable',
        title: 'Error',
        message: 'An unexpected error has occurred. Please reload the page and try again.',
    },
    {
        fail: 503,
        title: 'ROR API Error',
        message: 'The ROR API service is currently unavailable. Please refresh the page or try again later.',
    },
    {
        fail: 429,
        title: 'ROR API Error',
        message: 'Too many requests have been sent to the ROR API. Please wait a moment before continuing to search.',
    },
];
const FR_CONFIRM_DELETE =
    'Êtes-vous certain-e de vouloir supprimer cet élément ? Cette opération est irréversible.';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u43${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
function mailOf(username) {
    return `${username}@mail.test`;
}

/**
 * A fresh sign-in through the Login page in its own browser context, for a
 * session whose language the test switches (patterns.md parallel lesson 9:
 * the cached session would carry French into other tests).
 */
async function freshLogin(browser, baseURL, username) {
    const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
    const page = await context.newPage();
    await page.goto(`/index.php/${PK}${PK_PREFIX}/login`);
    await new LoginPage(page).signIn(username, getPassword(username));
    return {context, page};
}

/**
 * Open a preprint's workflow view and its Funding screen (the "Preprint"
 * nav group is expanded by default; FundingScreen handles a collapsed one).
 * Straight to the workflow dialog — a posted preprint's workflow opens on a
 * "Publication: …" screen with no "Workflow:" heading, so FundingScreen
 * waits on the Preprint menu instead.
 */
async function openFunding(page, contextPath, submissionId, {author = false} = {}) {
    await openWorkflow(page, contextPath, submissionId, {author});
    const funding = new FundingScreen(page);
    await funding.openFromWorkflow();
    return funding;
}

/**
 * Walk the author's resumable draft to its Details step: the reloaded
 * wizard resumes at its saved step, so the walk starts from Upload Files
 * only when Details is not already current (a not-yet-started step has no
 * rail button to jump to).
 */
async function openDraftDetails(page, contextPath, submissionId, {localePrefix = ''} = {}) {
    await page.goto(wizardUrl(contextPath, submissionId, {localePrefix}));
    await expectWizardOpen(page);
    if (!(await currentRailStep(page).textContent())?.includes(STEPS.details)) {
        await expectStep(page, STEPS.files);
        await continueTo(page, STEPS.details);
    }
    await expect(currentRailStep(page)).toContainText(STEPS.details);
}

/**
 * The Activity Log's positive control: a "Title & Abstract" save on the
 * same submission writes one "Submission metadata updated" line
 * (*Publication metadata*'s side effect, the U40 suite's control).
 */
async function saveTitlePrefix(page, contextPath, submissionId, prefix) {
    await openWorkflow(page, contextPath, submissionId);
    const screen = new PublicationScreen(page);
    await screen.openPage('Title & Abstract');
    await screen.input('titleAbstract', 'prefix', 'en').fill(prefix);
    await screen.save();
}

test.describe('Funding (U43)', () => {
    test('S1: record and revise funding in the workflow', {tag: '@smoke'}, async ({asUser, opsApi, pkpMail, browser, baseURL}, testInfo) => {
        test.slow();
        test.setTimeout(360_000);
        const tag = makeTag('s1', testInfo);
        // The install's own registry copy holds NSERC (footnote s1; the
        // `rors` key, idempotent: the same id comes back each time).
        const seeded = await opsApi.setSite({rors: [NSERC_RECORD]});
        expect(seeded.rors.map((r) => r.ror)).toEqual([NSERC_ROR]);
        // The Author is a throwaway account (created on a scratch server,
        // enrolled on the seeded server by the submission seed as the
        // wizard would), so the mailbox read below is scoped to an address
        // this test alone controls (A8; footnote s1).
        const author = `${tag}au`;
        await opsApi.createContext({
            tag,
            users: [
                {
                    username: author,
                    givenName: 'Ada',
                    familyName: 'Author',
                    email: mailOf(author),
                    roles: ['author'],
                },
            ],
        });
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: PK,
            submitter: author,
            title: `Submission ${tag}`,
        });
        const nameA = `Test Foundation ${tag}`;
        const unsavedName = `Unsaved Foundation ${tag}`;

        const page = await (await asUser('manager.maya')).newPage();
        // Every browser dialog (a "leave the page?" ask included) is
        // recorded and answered, for "nothing is asked" (Rule 5).
        const asked = [];
        page.on('dialog', async (d) => {
            asked.push(`${d.type()}: ${d.message()}`);
            await (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {});
        });
        // The browser-side search answers NSERC's and NIH's records to a
        // query their names match, and nothing else (footnote s1).
        await stubRegistrySearch(page, {records: REGISTRY_RECORDS});
        let funding = await openFunding(page, PK, submissionId);

        // "Funding": the screen is headed "Preprint: Funding" (opened by
        // openFromWorkflow), with the heading "Funders", the explanation, a
        // table whose column is "Funder Name", and "Order" and "Add Funder"
        // above it (Rule 3).
        await expect(page.getByRole('heading', {name: 'Funders', exact: true})).toBeVisible();
        await expect(
            page.getByText(
                'Add formal funding information, ensuring funders are properly credited and appear in the publication metadata.'
            )
        ).toBeVisible();
        await expect(
            funding.table().getByRole('columnheader', {name: 'Funder Name', exact: true})
        ).toBeVisible();
        await expect(funding.orderButton()).toBeVisible();
        await expect(funding.addFunderButton()).toBeVisible();
        // "Control": before the first add, the list reads "No funders have
        // been added." (Rule 3).
        await expect(funding.table()).toContainText(NO_FUNDERS);
        // The Activity Log's baseline (a seeded item already carries its
        // submit lines), for "no new entry" and the control's one line.
        const logBefore = await activityLogCounts(page);

        // "An empty save": Save with nothing filled: the Funder field's
        // message, "Please correct one error." and Save disabled until the
        // field is corrected (Fields).
        await funding.addFunderButton().click();
        const addPanel = funding.dialog('Add Funder');
        await expect(addPanel).toBeVisible({timeout: 30_000});
        await funding.saveButton(addPanel).click();
        await expect(funding.errorSummary(addPanel)).toContainText('Please correct one error.', {
            timeout: 30_000,
        });
        await expect(funding.funderFieldError(addPanel)).toBeVisible();
        await expect(funding.saveButton(addPanel)).toBeDisabled();

        // "The typed-name funder": the typed text picked from the top of
        // the suggestions: the name box marked "* Required" arrives
        // pre-filled with it; "Delete" under the chosen funder clears the
        // field (the search box is back, the name box gone); typed and
        // picked again, the pre-filled box is left as it is (Fields; Rule 5).
        await funding.pickTypedText(addPanel, nameA);
        await expect(funding.nameBox(addPanel)).toHaveValue(nameA);
        await expect(funding.saveButton(addPanel)).toBeEnabled();
        await funding.deleteFunderButton(addPanel).click();
        await expect(funding.searchInput(addPanel)).toBeVisible({timeout: 10_000});
        await expect(funding.nameBox(addPanel)).toHaveCount(0);
        await funding.pickTypedText(addPanel, nameA);
        await expect(funding.nameBox(addPanel)).toHaveValue(nameA);

        // "The grants": one grant row, "Field Study" / "1234" / "not-a-doi";
        // Save: "This is not formatted correctly." on the Grant DOI cell,
        // "Please correct one error." and Save disabled until the cell is
        // corrected; then "10.1234/example", a blank second row added with
        // "Add", Save: the panel closes and the row shows the name (Fields;
        // Rule 5).
        await funding.addGrantRow(addPanel, {
            grantName: 'Field Study',
            grantNumber: '1234',
            grantDoi: 'not-a-doi',
        });
        await funding.saveButton(addPanel).click();
        await expect(funding.grantDoiError(addPanel)).toBeVisible({timeout: 30_000});
        await expect(funding.errorSummary(addPanel)).toContainText('Please correct one error.');
        await expect(funding.saveButton(addPanel)).toBeDisabled();
        await addPanel.locator('input[name="grantDoi"]').first().fill('10.1234/example');
        await expect(funding.saveButton(addPanel)).toBeEnabled({timeout: 10_000});
        await addPanel.getByRole('button', {name: 'Add', exact: true}).click();
        await expect(funding.grantRows(addPanel)).toHaveCount(2);
        await funding.savePanel(addPanel);
        await expect(funding.row(nameA)).toBeVisible({timeout: 30_000});

        // "The registry funder": "Add Funder", "National Institutes of
        // Health" typed and its suggestion picked — the one showing a
        // country and the ROR mark; the panel shows the name and its
        // registry link. The install's copy lacks NIH and the server cannot
        // reach the registry, so the pick may raise A3's window (footnote
        // s1): it is dismissed with "OK" when the pick's own `POST rors`
        // was refused, and nothing is read from it. Save: the row carries
        // the ROR mark; what stands beside it is A3's and is not read — the
        // row is found by its mark (Rule 4).
        await funding.addFunderButton().click();
        const nihPanel = funding.dialog('Add Funder');
        await expect(nihPanel).toBeVisible({timeout: 30_000});
        const nihOption = await funding.searchRegistry(nihPanel, NIH);
        await expect(nihOption.locator('sub')).toHaveText('United States');
        await expect(nihOption.getByRole('img').first()).toBeVisible();
        await expect(
            nihOption.getByRole('link', {name: 'Open link in a new tab.'})
        ).toHaveAttribute('href', NIH_ROR);
        const nihAnswer = await funding.pickRegistryOption(nihOption);
        if (!nihAnswer.ok()) {
            await funding.pressWindowOk(funding.registryWindow('Error'));
        }
        await expect(funding.funderField(nihPanel)).toContainText(NIH, {timeout: 30_000});
        await expect(nihPanel.getByRole('link', {name: NIH_ROR})).toBeVisible();
        await funding.savePanel(nihPanel);
        const nihRow = funding.rorMarkedRows();
        await expect(nihRow).toHaveCount(1, {timeout: 30_000});
        await expect(funding.rows()).toHaveCount(2);
        // The typed-name row carries no mark (the same read; its positive
        // control the registry row's mark above).
        await expect(funding.rorMark(nameA)).toHaveCount(0);

        // "Ordering": "Order", the registry funder moved up with its arrow
        // (the arrows carry no name, A5; the first is "up"), "Save Order";
        // reloaded, it is still listed first (Rule 7).
        await funding.orderButton().click();
        await expect(funding.saveOrderButton()).toBeVisible();
        await nihRow.locator('button').first().click();
        const orderSaved = page.waitForResponse(
            (r) =>
                r.url().includes('/funders/order') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await funding.saveOrderButton().click();
        await orderSaved;
        funding = await openFunding(page, PK, submissionId);
        await expect(funding.rows()).toHaveCount(2, {timeout: 30_000});
        await expect(funding.rorMarkIn(funding.rows().first())).toHaveCount(1);
        await expect(funding.rows().nth(1)).toContainText(nameA);

        // "Edit": the typed-name funder's "…" → "Edit": the panel is titled
        // "Edit Funder", prefilled with the name and the one grant row, the
        // blank second row gone; the Grant Number changed to "5678" and
        // saved; reopened: "5678" is there; "Close" at the panel's top
        // dismisses it — the panel offers "Close" and "Save", no "Cancel"
        // (Fields; Rule 5).
        await funding.openRowAction(nameA, 'Edit');
        let editPanel = funding.dialog('Edit Funder');
        await expect(editPanel).toBeVisible({timeout: 30_000});
        await expect(funding.nameBox(editPanel)).toHaveValue(nameA);
        await expect(funding.grantRows(editPanel)).toHaveCount(1);
        await expect(editPanel.locator('input[name="grantName"]')).toHaveValue('Field Study');
        await expect(editPanel.locator('input[name="grantNumber"]')).toHaveValue('1234');
        await expect(editPanel.locator('input[name="grantDoi"]')).toHaveValue('10.1234/example');
        await editPanel.locator('input[name="grantNumber"]').fill('5678');
        await funding.savePanel(editPanel);
        // Persistence read on a fresh load (reopening the panel in the same
        // breath can prefill from the store's copy before its refetch of
        // the saved list lands).
        funding = await openFunding(page, PK, submissionId);
        await funding.openRowAction(nameA, 'Edit');
        editPanel = funding.dialog('Edit Funder');
        await expect(editPanel.locator('input[name="grantNumber"]')).toHaveValue('5678', {
            timeout: 30_000,
        });
        await expect(editPanel.getByRole('button', {name: 'Close', exact: true})).toBeVisible();
        await expect(funding.saveButton(editPanel)).toBeVisible();
        await expect(editPanel.getByRole('button', {name: 'Cancel', exact: true})).toHaveCount(0);
        await funding.closePanel(editPanel);

        // "Delete": "…" → "Delete" on the registry funder (found by its
        // mark): the confirmation asks its question; "Cancel" leaves it
        // listed; deleted again with "OK": the row is gone and the
        // typed-name funder alone remains (Rule 6).
        await funding.rorMarkedRows().getByRole('button', {name: 'More Actions'}).click();
        await funding.menuItem('Delete').click();
        let confirm = funding.deleteConfirmDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(confirm).toHaveCount(0, {timeout: 30_000});
        await expect(funding.rorMarkedRows()).toHaveCount(1);
        await funding.rorMarkedRows().getByRole('button', {name: 'More Actions'}).click();
        await funding.menuItem('Delete').click();
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
        await expect(funding.rorMarkedRows()).toHaveCount(0, {timeout: 30_000});
        await expect(funding.row(nameA)).toBeVisible();
        await expect(funding.rows()).toHaveCount(1);

        // "A registry search that fails" (footnote s1 makes each state on
        // the browser's own registry query): unreachable, "Natural
        // Sciences" typed: the window "Error" over the panel with its
        // message; "OK", then "Delete" under the chosen funder: the search
        // box is back. What stood behind the window is A16's and is not
        // read. Out of service: "ROR API Error" with its message; refusing
        // too many searches: "ROR API Error" with its own; each "OK" then
        // "Delete". Answering again: the full name brings its suggestion,
        // with a country and the ROR mark (Fields).
        await funding.addFunderButton().click();
        const searchPanel = funding.dialog('Add Funder');
        await expect(searchPanel).toBeVisible({timeout: 30_000});
        for (const {fail, title, message} of REGISTRY_FAILURES) {
            await stubRegistrySearch(page, {fail});
            await funding.typeSearch(searchPanel, 'Natural Sciences');
            const failWindow = funding.registryWindow(title);
            await expect(failWindow).toBeVisible({timeout: 30_000});
            await expect(failWindow.getByRole('heading', {name: title})).toBeVisible();
            await expect(failWindow).toContainText(message);
            await funding.pressWindowOk(failWindow);
            await funding.deleteFunderButton(searchPanel).click();
            await expect(funding.searchInput(searchPanel)).toBeVisible({timeout: 10_000});
        }
        await stubRegistrySearch(page, {records: REGISTRY_RECORDS});
        const nsercAgain = await funding.searchRegistry(searchPanel, NSERC);
        await expect(nsercAgain.locator('sub')).toHaveText('Canada');
        await expect(nsercAgain.getByRole('img').first()).toBeVisible();
        await expect(
            nsercAgain.getByRole('link', {name: 'Open link in a new tab.'})
        ).toHaveAttribute('href', NSERC_ROR);

        // "An unsaved funder dropped": that suggestion picked: the panel
        // shows the name and its registry link; "Close" without saving:
        // nothing is asked, the panel closes and the list still shows
        // "Test Foundation" alone; "Add Funder": the panel opens empty
        // (the search box, no chosen funder); "Unsaved Foundation" typed
        // and picked, the page reloaded with the panel open: nothing is
        // asked, and the list still shows "Test Foundation" alone (Rule 5).
        const unsavedPick = await funding.pickRegistryOption(nsercAgain);
        expect(unsavedPick.status()).toBe(200);
        await expect(funding.funderField(searchPanel)).toContainText(NSERC, {timeout: 30_000});
        await expect(searchPanel.getByRole('link', {name: NSERC_ROR})).toBeVisible();
        await funding.closePanel(searchPanel);
        await expect(funding.row(nameA)).toBeVisible();
        await expect(funding.rows()).toHaveCount(1);
        expect(asked).toEqual([]);
        await funding.addFunderButton().click();
        const emptyPanel = funding.dialog('Add Funder');
        await expect(emptyPanel).toBeVisible({timeout: 30_000});
        await expect(funding.searchInput(emptyPanel)).toHaveValue('');
        await expect(funding.nameBox(emptyPanel)).toHaveCount(0);
        await expect(funding.deleteFunderButton(emptyPanel)).toHaveCount(0);
        await expect(funding.funderField(emptyPanel).locator('a[href^="https://ror.org/"]')).toHaveCount(0);
        await funding.pickTypedText(emptyPanel, unsavedName);
        await expect(funding.nameBox(emptyPanel)).toHaveValue(unsavedName);
        await page.reload();
        await expect(page.getByRole('heading', {name: 'Preprint: Funding'})).toBeVisible({
            timeout: 30_000,
        });
        await expect(funding.row(nameA)).toBeVisible({timeout: 30_000});
        await expect(funding.rows()).toHaveCount(1);
        await expect(funding.row(unsavedName)).toHaveCount(0);
        expect(asked).toEqual([]);

        // "A registry funder the install already holds": "Add Funder",
        // NSERC typed and its suggestion picked — the one showing a
        // country and the ROR mark (the browser-side search answered with
        // the record the copy holds); the pick answers from the copy with
        // no error window (no server fetch, fn d); Save: the panel closes
        // and the list shows the registry's name with the ROR mark beside
        // it (Fields).
        await funding.addFunderButton().click();
        const registryPanel = funding.dialog('Add Funder');
        await expect(registryPanel).toBeVisible({timeout: 30_000});
        const nsercOption = await funding.searchRegistry(registryPanel, NSERC);
        await expect(nsercOption.locator('sub')).toHaveText('Canada');
        await expect(nsercOption.getByRole('img').first()).toBeVisible();
        await expect(
            nsercOption.getByRole('link', {name: 'Open link in a new tab.'})
        ).toHaveAttribute('href', NSERC_ROR);
        const rorsAnswer = await funding.pickRegistryOption(nsercOption);
        expect(rorsAnswer.status()).toBe(200);
        await expect(registryPanel.getByRole('link', {name: NSERC_ROR})).toBeVisible({
            timeout: 30_000,
        });
        await expect(funding.funderField(registryPanel)).toContainText(NSERC);
        await expect(funding.registryWindow('Error')).toHaveCount(0);
        await funding.savePanel(registryPanel);
        await expect(funding.row(NSERC)).toBeVisible({timeout: 30_000});
        await expect(funding.rorMark(NSERC)).toBeVisible();
        await expect(funding.rows()).toHaveCount(2);
        // The typed-name funder's row carries no mark (the same read, its
        // positive control the NSERC row's mark above).
        await expect(funding.rorMark(nameA)).toHaveCount(0);

        // "Nothing else happens": the submission's Activity Log & Notes →
        // History has no new entry after the adds, edits, deletes and
        // reorders (Side effects); its positive control is a "Title &
        // Abstract" save on the same submission, one "Submission metadata
        // updated" line.
        const logAfterEdits = await activityLogCounts(page);
        expect(logAfterEdits).toEqual(logBefore);
        await saveTitlePrefix(page, PK, submissionId, 'The');
        const logAfterControl = await activityLogCounts(page);
        expect(logAfterControl.rows).toBe(logBefore.rows + 1);
        expect(logAfterControl.metadataUpdated).toBe(logBefore.metadataUpdated + 1);

        // … and no email arrived in the mail catcher for the submitter from
        // these operations, bounded by a mail this test causes the same
        // way (A8).
        const afterControl = await sendMailControl({asUser, api: opsApi, tag});
        await pkpMail.expectNone({to: mailOf(author), afterControl});

        // "The list in French": the same Funding screen, its address's
        // "/en" swapped for "/fr_CA", in a fresh sign-in of the manager
        // (the French visit switches that session's language).
        const nameFr = `Fondation Exemple ${tag}`;
        const french = await freshLogin(browser, baseURL, 'manager.maya');
        try {
            const fr = french.page;
            await stubRegistrySearch(fr);
            await fr.goto(
                `/index.php/${PK}${PK_PREFIX}/dashboard/editorial?workflowSubmissionId=${submissionId}`
            );
            const frFunding = new FundingScreen(fr);
            await frFunding.openFromWorkflow();
            const englishUrl = fr.url();
            expect(englishUrl).toContain(`/index.php/${PK}/en/`);
            await fr.goto(englishUrl.replace(`/index.php/${PK}/en/`, `/index.php/${PK}/fr_CA/`));

            // "Order" reads "Trier"; pressed, it relabels "Enregistrer
            // l'ordre", which saves the order as it stands (Rules 7, 14).
            const trier = fr.getByRole('button', {name: 'Trier', exact: true});
            await expect(trier).toBeVisible({timeout: 30_000});
            await expect(frFunding.anyLocaleRow(nameA)).toBeVisible({timeout: 30_000});
            await expect(fr.getByRole('button', {name: 'Order', exact: true})).toHaveCount(0);
            await trier.click();
            const saveOrderFr = fr.getByRole('button', {name: "Enregistrer l'ordre", exact: true});
            await expect(saveOrderFr).toBeVisible();
            await expect(trier).toHaveCount(0);
            const frOrderSaved = fr.waitForResponse(
                (r) =>
                    r.url().includes('/funders/order') &&
                    r.request().method() === 'POST' &&
                    r.ok(),
                {timeout: 30_000}
            );
            await saveOrderFr.click();
            await frOrderSaved;
            await expect(trier).toBeVisible({timeout: 30_000});

            // "Test Foundation"'s "…" menu: its two entries read French;
            // the second opens the delete confirmation in French; its
            // cancel button leaves "Test Foundation" listed (Rules 6, 14).
            await frFunding.anyLocaleRowMenuButton(nameA).click();
            await expect(fr.getByRole('menuitem', {name: 'Modifier', exact: true})).toBeVisible({
                timeout: 10_000,
            });
            await expect(fr.getByRole('menuitem', {name: 'Supprimer', exact: true})).toBeVisible();
            await expect(fr.getByRole('menuitem')).toHaveCount(2);
            await fr.getByRole('menuitem', {name: 'Supprimer', exact: true}).click();
            const frConfirm = fr.getByRole('dialog').filter({hasText: FR_CONFIRM_DELETE});
            await expect(frConfirm).toBeVisible({timeout: 30_000});
            await expect(frConfirm.getByRole('heading', {name: 'Supprimer'})).toBeVisible();
            await expect(frConfirm.getByRole('button', {name: 'OK', exact: true})).toBeVisible();
            await frConfirm.getByRole('button', {name: 'Annuler', exact: true}).click();
            await expect(frConfirm).toHaveCount(0, {timeout: 30_000});
            await expect(frFunding.anyLocaleRow(nameA)).toBeVisible();

            // The other button above the table opens the panel; the typed
            // text picked: "Ajouter" under the grants, "Enregistrer",
            // "Fermer" and "Supprimer" under the chosen funder read French
            // (Rule 14); the pre-filled name box left as it is.
            await frFunding.buttonBesideOrder(trier).click();
            const frPanel = frFunding.anyLocalePanel();
            await expect(frPanel).toBeVisible({timeout: 30_000});
            const frSearch = frFunding.searchInput(frPanel);
            await frSearch.click();
            await frSearch.pressSequentially(nameFr, {delay: 15});
            await frPanel
                .locator('li.autosuggest__results-item')
                .filter({hasText: nameFr})
                .first()
                .click();
            await expect(frPanel.locator('input[name="name"]').first()).toHaveValue(nameFr, {
                timeout: 10_000,
            });
            await expect(frPanel.getByRole('button', {name: 'Ajouter', exact: true})).toBeVisible();
            await expect(
                frPanel.getByRole('button', {name: 'Enregistrer', exact: true})
            ).toBeVisible();
            await expect(frPanel.getByRole('button', {name: 'Fermer', exact: true})).toBeVisible();
            await expect(
                frPanel
                    .locator('.pkpFormField--funder')
                    .getByRole('button', {name: 'Supprimer', exact: true})
            ).toBeVisible();
            await expect(frPanel.getByRole('button', {name: 'Save', exact: true})).toHaveCount(0);

            // The French "Save": the panel closes and "Fondation Exemple"
            // is listed at once; reloaded, it is still listed, beside
            // "Test Foundation" (its position is A7's question, not
            // asserted) (Rule 14).
            const frSaved = fr.waitForResponse(
                (r) =>
                    r.url().includes('/funders') &&
                    r.request().method() === 'POST' &&
                    r.ok(),
                {timeout: 30_000}
            );
            await frPanel.getByRole('button', {name: 'Enregistrer', exact: true}).click();
            await frSaved;
            await expect(frPanel).toHaveCount(0, {timeout: 30_000});
            await expect(frFunding.anyLocaleRow(nameFr)).toBeVisible({timeout: 30_000});
            await fr.reload();
            await expect(trier).toBeVisible({timeout: 30_000});
            await expect(frFunding.anyLocaleRow(nameFr)).toBeVisible({timeout: 30_000});
            await expect(frFunding.anyLocaleRow(nameA)).toBeVisible();
        } finally {
            await french.context.close();
        }
    });

    test('S2: declare funding while submitting', {tag: '@smoke'}, async ({asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s2', testInfo);
        // The install's registry copy holds NSERC (footnote s2: scenario
        // 1's record and `rors` key, idempotent).
        const [seeded, {submissionId}] = await Promise.all([
            opsApi.setSite({rors: [NSERC_RECORD]}),
            opsApi.createSubmission({
                tag,
                context: PK,
                submitter: 'author.alex',
                title: `Submission ${tag}`,
                submitted: false,
            }),
        ]);
        expect(seeded.rors.map((r) => r.ror)).toEqual([NSERC_ROR]);
        const funderName = `Test Foundation ${tag}`;

        // The author walks the wizard to Details; the server sits at the
        // default "ask" level, so the step carries a Funders section. The
        // Upload Files step manages the preprint's galleys (legacy grid).
        const authorPage = await (await asUser('author.alex')).newPage();
        await stubRegistrySearch(authorPage, {records: REGISTRY_RECORDS});
        await authorPage.goto(wizardUrl(PK, submissionId, {localePrefix: PK_PREFIX}));
        await expectWizardOpen(authorPage);
        await expectStep(authorPage, STEPS.files);
        await addGalleyFile(authorPage);
        await continueTo(authorPage, STEPS.details);

        // "The Details step": its last section is the funders one, headed
        // "Funding" (Rule 10; pkp-lib#13375);
        // "Control": before the add, the section's table reads "No funders
        // have been added." (Rules 3, 10).
        const wizardFunding = new FundingScreen(authorPage);
        await expect(wizardFunding.wizardFundersSection()).toBeVisible({timeout: 30_000});
        await expect(
            wizardFunding.wizardStepSections().last().getByRole('heading', {level: 2})
        ).toHaveText('Funding');
        await expect(wizardFunding.table()).toContainText(NO_FUNDERS);

        // The typed-name funder recorded there. On a preprint server the
        // section's table refreshes only after a reload (A4 🐞): nothing is
        // read from it after the save, which is bounded by the funders API
        // response and the panel closing; the page is reloaded and walked
        // back to Details, where the table shows the row (Rule 10).
        await wizardFunding.addFunder(funderName, {expectRow: false});
        await openDraftDetails(authorPage, PK, submissionId, {localePrefix: PK_PREFIX});
        await expect(wizardFunding.row(funderName)).toBeVisible({timeout: 30_000});

        // "A registry funder the install already holds": "Add Funder",
        // NSERC typed and its suggestion picked — the one showing a country
        // and the ROR mark; Save; reloaded and back on Details: the
        // section's table shows NSERC's name (Fields; Rule 10).
        await wizardFunding.addFunderButton().click();
        const registryPanel = wizardFunding.dialog('Add Funder');
        await expect(registryPanel).toBeVisible({timeout: 30_000});
        const nsercOption = await wizardFunding.searchRegistry(registryPanel, NSERC);
        await expect(nsercOption.locator('sub')).toHaveText('Canada');
        await expect(nsercOption.getByRole('img').first()).toBeVisible();
        await expect(
            nsercOption.getByRole('link', {name: 'Open link in a new tab.'})
        ).toHaveAttribute('href', NSERC_ROR);
        const rorsAnswer = await wizardFunding.pickRegistryOption(nsercOption);
        expect(rorsAnswer.status()).toBe(200);
        await expect(registryPanel.getByRole('link', {name: NSERC_ROR})).toBeVisible({
            timeout: 30_000,
        });
        await wizardFunding.savePanel(registryPanel);
        await openDraftDetails(authorPage, PK, submissionId, {localePrefix: PK_PREFIX});
        await expect(wizardFunding.row(NSERC)).toBeVisible({timeout: 30_000});
        await expect(wizardFunding.row(funderName)).toBeVisible();

        // "The Review step": both funders' names are listed under
        // "Details" (Fields; Rule 10); the For Readers step's required
        // Relation status is answered on the way (the wizard shell's own
        // requirement); the submission is completed.
        await continueTo(authorPage, STEPS.contributors);
        await continueTo(authorPage, STEPS.readers);
        await setRelationStatus(authorPage);
        await openReview(authorPage);
        const detailsPanel = reviewPanel(authorPage, 'Details');
        await expect(detailsPanel).toContainText('Funders');
        await expect(detailsPanel).toContainText(funderName);
        await expect(detailsPanel).toContainText(NSERC);
        await expect(problemsBanner(authorPage)).toHaveCount(0);
        await confirmSubmit(authorPage, {message: SUBMIT_DIALOGS.moderated});

        // "The Journal Manager's list": the Preprint Server Manager finds
        // both of the author's funders on the workflow's Funding screen
        // (Rule 1).
        const managerPage = await (await asUser('manager.maya')).newPage();
        const funding = await openFunding(managerPage, PK, submissionId);
        await expect(funding.row(funderName)).toBeVisible({timeout: 30_000});
        await expect(funding.row(NSERC)).toBeVisible();
        await expect(funding.rows()).toHaveCount(2);
    });

    test('S3: readers see a posted preprint\'s funding', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const controlTag = `${tag}c`;
        // The install's registry copy holds NSERC (footnote s3: scenario
        // 1's record and `rors` key, idempotent).
        const [withFunder, noFunder, seeded] = await Promise.all([
            opsApi.createSubmission({
                tag,
                context: PK,
                submitter: 'author.alex',
                title: `Submission ${tag}`,
                published: true,
            }),
            opsApi.createSubmission({
                tag: controlTag,
                context: PK,
                submitter: 'author.alex',
                title: `Submission ${controlTag}`,
                published: true,
            }),
            opsApi.setSite({rors: [NSERC_RECORD]}),
        ]);
        expect(seeded.rors.map((r) => r.ror)).toEqual([NSERC_ROR]);
        const testFoundation = `Test Foundation ${tag}`;
        const secondFoundation = `Second Foundation ${tag}`;
        const grantName = 'Field Study';
        const grantNumber = '1234';
        const grantDoi = '10.1234/example';

        // The manager records the two hand-named funders and the registry
        // funder the install's copy holds (NSERC, picked through the panel
        // with the browser-side search answered by its record, footnote
        // s3) on the posted preprint (posting does not lock the list —
        // Actors & permissions), the first with its fully filled grant, and
        // orders "Second Foundation" first with "Order" / "Save Order".
        const managerPage = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(managerPage, {records: REGISTRY_RECORDS});
        let funding = await openFunding(managerPage, PK, withFunder.submissionId);
        await funding.addFunder(testFoundation, {
            grants: [{grantName, grantNumber, grantDoi}],
        });
        await funding.addFunder(secondFoundation);
        await funding.addFunderButton().click();
        const registryPanel = funding.dialog('Add Funder');
        await expect(registryPanel).toBeVisible({timeout: 30_000});
        const rorsAnswer = await funding.pickRegistryOption(
            await funding.searchRegistry(registryPanel, NSERC)
        );
        expect(rorsAnswer.status()).toBe(200);
        await expect(registryPanel.getByRole('link', {name: NSERC_ROR})).toBeVisible({
            timeout: 30_000,
        });
        await funding.savePanel(registryPanel);
        await expect(funding.row(NSERC)).toBeVisible({timeout: 30_000});
        await funding.orderButton().click();
        await funding.orderArrows(secondFoundation).first().click();
        const orderSaved = managerPage.waitForResponse(
            (r) =>
                r.url().includes('/funders/order') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await funding.saveOrderButton().click();
        await orderSaved;
        funding = await openFunding(managerPage, PK, withFunder.submissionId);
        await expect(funding.rows().first()).toContainText(secondFoundation, {timeout: 30_000});

        // "The 'Funders' block": on a preprint server the landing page is
        // the preprint's page. The anonymous reader's page carries the
        // Funders block with "Test Foundation" and, under it, "Field
        // Study", "Grant Number" with "1234" and "Grant DOI" with the DOI
        // as a working doi.org link (Rule 9).
        const reader = new FundingScreen(page);
        await page.goto(
            `/index.php/${PK}${PK_PREFIX}/preprint/view/${withFunder.submissionId}`
        );
        const block = reader.fundersBlock();
        await expect(block.getByRole('heading', {name: 'Funders'})).toBeVisible({
            timeout: 30_000,
        });
        const testItem = block.locator('li').filter({has: page.getByText(testFoundation)}).first();
        await expect(testItem).toContainText(grantName);
        await expect(testItem).toContainText(`Grant Number ${grantNumber}`);
        await expect(testItem).toContainText('Grant DOI');
        const doiLink = testItem.getByRole('link', {name: `https://doi.org/${grantDoi}`});
        await expect(doiLink).toHaveAttribute('href', `https://doi.org/${grantDoi}`);

        // "The saved order": "Second Foundation" is listed before "Test
        // Foundation" (Rule 7; the server-rendered list, read once settled
        // by the count).
        await expect(reader.fundersBlockNames()).toHaveCount(3);
        const listed = (await reader.fundersBlockNames().allTextContents()).map((t) => t.trim());
        expect(listed).toContain(secondFoundation);
        expect(listed).toContain(testFoundation);
        expect(listed.indexOf(secondFoundation)).toBeLessThan(listed.indexOf(testFoundation));

        // "The registry funder": NSERC's name shows beside its ROR mark,
        // and the mark links to its record on the registry site (Fields;
        // Rule 9).
        const nsercEntry = reader.fundersBlockNames().filter({hasText: NSERC});
        await expect(nsercEntry).toHaveCount(1);
        const nsercMark = nsercEntry.locator(`a[href="${NSERC_ROR}"]`);
        await expect(nsercMark).toHaveCount(1);
        await expect(nsercMark.locator('svg')).toBeVisible();

        // "Control": a posted preprint with no funders shows no Funders
        // block at all — bounded by the page having rendered (its title),
        // the same way the presence leg was read (Rule 9).
        await page.goto(
            `/index.php/${PK}${PK_PREFIX}/preprint/view/${noFunder.submissionId}`
        );
        await expect(
            page.getByRole('heading', {name: `Submission ${controlTag}`})
        ).toBeVisible({timeout: 30_000});
        await expect(reader.fundersBlock()).toHaveCount(0);
    });

    test('S4: the server opts out of funding', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        // Scratch preprint server (the setting is mutated; a fresh server
        // starts at "Ask…", footnote c) with throwaway users.
        await opsApi.createContext({
            tag,
            users: [
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
            ],
        });
        // One posted preprint (the landing-page read with the setting off
        // needs a page, footnote s4) and the Author's draft.
        const [{submissionId}, draft] = await Promise.all([
            opsApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: `${tag}au`,
                title: `Submission ${tag}s`,
                published: true,
            }),
            opsApi.createSubmission({
                tag: `${tag}d`,
                context: tag,
                submitter: `${tag}au`,
                title: `Submission ${tag}d`,
                submitted: false,
            }),
        ]);
        const funderName = `Test Foundation ${tag}`;
        const landingUrl = `/index.php/${tag}/preprint/view/${submissionId}`;

        // A funder recorded while the server sits at its "ask" default —
        // the positive control for both surfaces and for the re-tick leg.
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await stubRegistrySearch(managerPage);
        let funding = await openFunding(managerPage, tag, submissionId);
        await funding.addFunder(funderName);

        // "Control": before the untick, the submission's Publication area
        // shows "Funding" (just opened) and the Author's Details step ends
        // with its Funders section (Rule 2). The draft gets its uploaded,
        // genre-assigned file here, so that at "Require" the funders
        // warning is the only notice on the Review step (footnote s4).
        await expect(funding.fundingMenuLink()).toBeVisible();
        const authorPage = await (await asUser(`${tag}au`)).newPage();
        await stubRegistrySearch(authorPage);
        const wizard = new FundingScreen(authorPage);
        await authorPage.goto(wizardUrl(tag, draft.submissionId));
        await expectWizardOpen(authorPage);
        await expectStep(authorPage, STEPS.files);
        await addGalleyFile(authorPage);
        await continueTo(authorPage, STEPS.details);
        await expect(wizard.wizardFundersSection()).toBeVisible({timeout: 30_000});
        await expect(
            wizard.wizardStepSections().last().getByRole('heading', {level: 2})
        ).toHaveText('Funding');

        // "The setting off": "Enable funder metadata" unticked and saved:
        // the workflow's Preprint area offers no "Funding" entry — bounded
        // by its sibling "Title & Abstract" entry rendering (Rule 2;
        // Settings).
        const settings = new FundingScreen(managerPage);
        await settings.openMetadataSettings(tag);
        await settings.enableFunderMetadataBox().uncheck();
        await settings.saveMetadataSettings();
        await openWorkflow(managerPage, tag, submissionId);
        await expect(
            managerPage.getByRole('link', {name: 'Title & Abstract', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(settings.fundingMenuLink()).toHaveCount(0);

        // "The wizard with the setting off": the Author's Details step has
        // no Funders section — bounded by the step being current and its
        // "Submission Details" section rendering (Rule 2).
        await openDraftDetails(authorPage, tag, draft.submissionId);
        await expect(
            authorPage.getByRole('heading', {name: 'Submission Details', level: 2})
        ).toBeVisible({timeout: 30_000});
        await expect(wizard.wizardFundersSection()).toHaveCount(0);

        // "The published page with the setting off": the posted preprint's
        // page still lists the funder in its Funders block (Rule 2; Rule 9).
        await authorPage.goto(landingUrl);
        await expect(
            wizard.fundersBlock().getByRole('heading', {name: 'Funders'})
        ).toBeVisible({timeout: 30_000});
        await expect(wizard.fundersBlock()).toContainText(funderName);

        // "The setting on again": re-ticked and saved as it stands on "Do
        // not request…" (what the radios arrive on is A8's question, not
        // asserted: the level is picked explicitly, a no-op when it is
        // already selected): the workflow shows the "Funding" entry again,
        // and the Author's Details step still has no Funders section (Rule
        // 2, the enabled level; Settings).
        await settings.openMetadataSettings(tag);
        await settings.enableFunderMetadataBox().check();
        await settings.funderLevelRadio(LEVELS.noRequest).check();
        await settings.saveMetadataSettings();
        funding = await openFunding(managerPage, tag, submissionId);
        await expect(funding.row(funderName)).toBeVisible({timeout: 30_000});
        await openDraftDetails(authorPage, tag, draft.submissionId);
        await expect(
            authorPage.getByRole('heading', {name: 'Submission Details', level: 2})
        ).toBeVisible({timeout: 30_000});
        await expect(wizard.wizardFundersSection()).toHaveCount(0);

        // "'Ask' again": both surfaces are back and the submission's list
        // still holds its funder (Rule 2).
        await settings.openMetadataSettings(tag);
        await settings.funderLevelRadio(LEVELS.request).check();
        await settings.saveMetadataSettings();
        funding = await openFunding(managerPage, tag, submissionId);
        await expect(funding.row(funderName)).toBeVisible({timeout: 30_000});
        await openDraftDetails(authorPage, tag, draft.submissionId);
        await expect(wizard.wizardFundersSection()).toBeVisible({timeout: 30_000});
        await expect(wizard.table()).toContainText(NO_FUNDERS);

        // "'Require'": picked and saved (Settings).
        await settings.openMetadataSettings(tag);
        await settings.funderLevelRadio(LEVELS.require).check();
        await settings.saveMetadataSettings();

        // "The Review step at 'Require'": the Author's draft (started, its
        // file uploaded, before the untick), with no funder declared,
        // walked to its Review step: "Funders are required." under
        // "Details", the problems notice, and "Submit" grayed out (Rule 11).
        // Its positive control is S2's Review step, where the notice is
        // absent and "Submit" completes the submission.
        await openDraftDetails(authorPage, tag, draft.submissionId);
        await expect(wizard.wizardFundersSection()).toBeVisible({timeout: 30_000});
        await continueTo(authorPage, STEPS.contributors);
        await continueTo(authorPage, STEPS.readers);
        await setRelationStatus(authorPage);
        await openReview(authorPage);
        const details = reviewPanel(authorPage, 'Details');
        await expect(details.getByText('Funders are required.')).toBeVisible({timeout: 30_000});
        await expect(wizard.fundersRequiredWarning()).toHaveText(/Funders are required\./);
        await expect(problemsBanner(authorPage)).toContainText(
            'There are one or more problems that need to be fixed before you can submit. Please review the information below and make the requested changes.'
        );
        await expect(submitButton(authorPage)).toBeVisible();
        await expect(submitButton(authorPage)).toBeDisabled();
    });

    test('S5: the submitting author edits their unposted preprint\'s funders', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        // The Author's own submitted, not-yet-posted preprint by a roster
        // author, whose one hand-named funder the manager records through
        // the panel (footnote s5).
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });
        const funderName = `Test Foundation ${tag}`;
        const managerPage = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(managerPage);
        let managerFunding = await openFunding(managerPage, PK, submissionId);
        await managerFunding.addFunder(funderName, {
            grants: [{grantName: 'Field Study', grantNumber: '1234'}],
        });

        // "A preprint server": the submitting author's own workflow Funding
        // list is fully editable before posting (OPS1; Actors row 2): the
        // row shows the funder; "Add Funder" works (its panel opens);
        // "Order" works (the row's arrows and "Save Order" appear, and the
        // order saves); the row's "…" menu offers "Edit" and "Delete", and
        // "Edit" opens "Edit Funder" prefilled with the funder (Rules 4, 5);
        // the author's own change persists.
        const authorPage = await (await asUser('author.alex')).newPage();
        await stubRegistrySearch(authorPage);
        let funding = await openFunding(authorPage, PK, submissionId, {author: true});
        await expect(funding.row(funderName)).toBeVisible({timeout: 30_000});
        await expect(funding.addFunderButton()).toBeEnabled();
        await funding.addFunderButton().click();
        const addPanel = funding.dialog('Add Funder');
        await expect(addPanel).toBeVisible({timeout: 30_000});
        await funding.closePanel(addPanel);
        await expect(funding.orderButton()).toBeEnabled();
        await funding.orderButton().click();
        await expect(funding.saveOrderButton()).toBeVisible();
        await expect(funding.orderArrows(funderName)).toHaveCount(2);
        const orderSaved = authorPage.waitForResponse(
            (r) =>
                r.url().includes('/funders/order') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await funding.saveOrderButton().click();
        await orderSaved;
        await expect(funding.orderButton()).toBeVisible();
        await expect(funding.rowMoreActions(funderName)).toBeVisible();
        await funding.openRowMenu(funderName);
        await expect(funding.menuItem('Edit')).toBeVisible();
        await expect(funding.menuItem('Delete')).toBeVisible();
        await funding.menuItem('Edit').click();
        const editPanel = funding.dialog('Edit Funder');
        await expect(editPanel).toBeVisible({timeout: 30_000});
        await expect(funding.nameBox(editPanel)).toHaveValue(funderName);
        await expect(editPanel.locator('input[name="grantNumber"]')).toHaveValue('1234');
        await editPanel.locator('input[name="grantNumber"]').fill('5678');
        await funding.savePanel(editPanel);
        funding = await openFunding(authorPage, PK, submissionId, {author: true});
        await funding.openRowAction(funderName, 'Edit');
        const reopened = funding.dialog('Edit Funder');
        await expect(reopened.locator('input[name="grantNumber"]')).toHaveValue('5678', {
            timeout: 30_000,
        });
        await funding.closePanel(reopened);

        // "Control": the Preprint Server Manager's "Funding" on the same
        // submission offers "Add Funder" and "Order" and the row's "…" menu
        // with "Edit" and "Delete" (Rules 3, 4).
        managerFunding = await openFunding(managerPage, PK, submissionId);
        await expect(managerFunding.row(funderName)).toBeVisible({timeout: 30_000});
        await expect(managerFunding.addFunderButton()).toBeEnabled();
        await expect(managerFunding.orderButton()).toBeEnabled();
        await expect(managerFunding.rowMoreActions(funderName)).toBeVisible();
        await managerFunding.openRowMenu(funderName);
        await expect(managerFunding.menuItem('Edit')).toBeVisible();
        await expect(managerFunding.menuItem('Delete')).toBeVisible();
        await managerFunding.menuItem('Edit').click();
        const managerEdit = managerFunding.dialog('Edit Funder');
        await expect(funding.nameBox(managerEdit)).toHaveValue(funderName, {timeout: 30_000});
        await managerFunding.closePanel(managerEdit);
    });
});
