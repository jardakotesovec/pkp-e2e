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
 * spec's Coverage section records everything else left out): A3, A4 and A5
 * (🐞: the registry pick the server cannot cache — every funder takes the
 * typed-name path with the browser-side registry query stubbed, and a
 * second typed-name funder stands in for S1's and S3's registry funder;
 * the wizard table's stale read after a save, never asserted either way;
 * the ordering arrows' missing names, reached positionally); A1 and A8
 * (only the scenario's own sentence is asserted: the "Funders are
 * required." warning, never the submit's state; the re-tick's level saved
 * at "Do not request…", never what the radios arrived on); A2, A6, A7, A9,
 * A10, A11 and A12 (❓, no assertion).
 *
 * Hermeticity: the Funder field queries the public ROR registry from the
 * BROWSER; the suite stubs that query to an empty result set
 * (FundingPages.stubRegistrySearch) so no test depends on api.ror.org —
 * the typed-name path under test renders its typed-text option
 * independently of the suggestions payload.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only at the server level — S1, S2, S3 and S5 mutate only their
 * own seeded submissions there (S1's Author is a throwaway account created
 * on a scratch server, for the mailbox read's scoping); S4's settings
 * mutation runs on a scratch preprint server with throwaway users. There is
 * no funder seeding key — the add/edit panel IS the surface under test, so
 * funders are always recorded through it. Waits are event-based (funders
 * API responses, form-save responses, web-first assertions) — no
 * hard-coded sleeps. Every absence read is bounded by a positive control
 * taken the same way (PRINCIPLES M4, M6; the mailbox read by the discussion
 * mail the test itself causes, A8; the Activity Log read by the "Title &
 * Abstract" save the test makes). Everything runs in the parallel `ops`
 * project.
 */
const {test, expect} = require('../support/fixtures.js');
const {FundingScreen, stubRegistrySearch} = require('../pages/FundingPages.js');
const {
    PublicationScreen,
    openWorkflow,
    activityLogCounts,
    addDiscussion,
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
} = require('../pages/SubmissionWizardPages.js');

const PK = 'publicknowledge';
const PK_PREFIX = '/en';
const LEVELS = {
    noRequest: 'Do not request funder metadata from the author during submission.',
    request: 'Ask the author for funder metadata during submission.',
    require: 'Require the author to add funder metadata before accepting their submission.',
};
const NO_FUNDERS = 'No funders have been added.';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u43${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
function mailOf(username) {
    return `${username}@mail.test`;
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
 * The mailbox's positive control (A8): a discussion opened on the
 * submission's Production stage with the Moderator's box ticked and the
 * Author's left unticked, whose copy reaches the Moderator; the seeded
 * server's real submit assigned the section's Moderator, so the box is
 * there. Returns the `afterControl` for `pkpMail.expectNone`.
 */
async function sendMailControl(page, contextPath, submissionId, tag) {
    const discussion = `Control ${tag}`;
    await openWorkflow(page, contextPath, submissionId);
    await new PublicationScreen(page).openProductionStage();
    await addDiscussion(page, {
        name: discussion,
        message: `Control message ${tag}.`,
        participants: ['sectioneditor.ana'],
    });
    return {to: mailOf('sectioneditor.ana'), subject: discussion};
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
    test('S1: record and revise funding in the workflow', {tag: '@smoke'}, async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s1', testInfo);
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
        // The spec's registry funder cannot be produced here (A3, the file
        // header): a second typed-name funder stands in for it in the
        // ordering and delete legs.
        const nameB = `Second Funder ${tag}`;

        const page = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(page);
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

        // "The registry funder": its stand-in, a second typed-name funder
        // (A3, the file header); the row shows the name (Rule 4).
        await funding.addFunder(nameB);

        // "Ordering": "Order", the second funder moved up with its arrow
        // (the arrows carry no name, A5; the first is "up"), "Save Order";
        // reloaded, it is still listed first (Rule 7).
        await funding.orderButton().click();
        await expect(funding.saveOrderButton()).toBeVisible();
        await funding.orderArrows(nameB).first().click();
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
        await expect(funding.rows().first()).toContainText(nameB, {timeout: 30_000});
        await expect(funding.rows().nth(1)).toContainText(nameA);

        // "Edit": the typed-name funder's "…" → "Edit": the panel is titled
        // "Edit Funder", prefilled with the name and the one grant row, the
        // blank second row gone; the Grant Number changed to "5678" and
        // saved; reopened: "5678" is there; dismissed (Fields; Rule 5). The
        // panel's dismiss control reads "Close" (T-ops-1 in the findings
        // file: the spec's "Cancel").
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
        await funding.closePanel(editPanel);

        // "Delete": "…" → "Delete" on the stand-in: the confirmation asks
        // its question; "Cancel" leaves it listed; deleted again with "OK":
        // the row is gone and the typed-name funder alone remains (Rule 6).
        await funding.openRowAction(nameB, 'Delete');
        let confirm = funding.deleteConfirmDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(confirm).toHaveCount(0, {timeout: 30_000});
        await expect(funding.row(nameB)).toBeVisible();
        await funding.openRowAction(nameB, 'Delete');
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
        await expect(funding.row(nameB)).toHaveCount(0, {timeout: 30_000});
        await expect(funding.row(nameA)).toBeVisible();
        await expect(funding.rows()).toHaveCount(1);

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
        const afterControl = await sendMailControl(page, PK, submissionId, tag);
        await pkpMail.expectNone({to: mailOf(author), afterControl});
    });

    test('S2: declare funding while submitting', {tag: '@smoke'}, async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            submitted: false,
        });
        const funderName = `Test Foundation ${tag}`;

        // The author walks the wizard to Details; the server sits at the
        // default "ask" level, so the step carries a Funders section. The
        // Upload Files step manages the preprint's galleys (legacy grid).
        const authorPage = await (await asUser('author.alex')).newPage();
        await stubRegistrySearch(authorPage);
        await authorPage.goto(wizardUrl(PK, submissionId, {localePrefix: PK_PREFIX}));
        await expectWizardOpen(authorPage);
        await expectStep(authorPage, STEPS.files);
        await addGalleyFile(authorPage);
        await continueTo(authorPage, STEPS.details);

        // "The Details step": its last section is "Funders" (Rule 10);
        // "Control": before the add, the section's table reads "No funders
        // have been added." (Rules 3, 10).
        const wizardFunding = new FundingScreen(authorPage);
        await expect(wizardFunding.wizardFundersSection()).toBeVisible({timeout: 30_000});
        await expect(
            wizardFunding.wizardStepSections().last().getByRole('heading', {level: 2})
        ).toHaveText('Funders');
        await expect(wizardFunding.table()).toContainText(NO_FUNDERS);

        // The typed-name funder recorded there. The section's table does
        // not refresh on a preprint server (A4 🐞) — nothing is asserted
        // about it after the save; the save itself is bounded by the
        // funders API response and the panel closing. A fresh load of the
        // resumable wizard then reads the saved list: the row is there
        // (Rule 10: the same list as the workflow).
        await wizardFunding.addFunder(funderName, {expectRow: false});
        await openDraftDetails(authorPage, PK, submissionId, {localePrefix: PK_PREFIX});
        await expect(wizardFunding.row(funderName)).toBeVisible({timeout: 30_000});

        // "The Review step": the funder's name is listed under "Details"
        // (Rule 10); the For Readers step's required Relation status is
        // answered on the way (the wizard shell's own requirement); the
        // submission is completed.
        await continueTo(authorPage, STEPS.contributors);
        await continueTo(authorPage, STEPS.readers);
        await setRelationStatus(authorPage);
        await openReview(authorPage);
        const detailsPanel = reviewPanel(authorPage, 'Details');
        await expect(detailsPanel).toContainText('Funders');
        await expect(detailsPanel).toContainText(funderName);
        await expect(problemsBanner(authorPage)).toHaveCount(0);
        await confirmSubmit(authorPage, {message: SUBMIT_DIALOGS.moderated});

        // "The Journal Manager's list": the Preprint Server Manager finds
        // the author's funder on the workflow's Funding screen (Rule 1).
        const managerPage = await (await asUser('manager.maya')).newPage();
        const funding = await openFunding(managerPage, PK, submissionId);
        await expect(funding.row(funderName)).toBeVisible({timeout: 30_000});
    });

    test('S3: readers see a posted preprint\'s funding', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const controlTag = `${tag}c`;
        const [withFunder, noFunder] = await Promise.all([
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
        ]);
        const testFoundation = `Test Foundation ${tag}`;
        const secondFoundation = `Second Foundation ${tag}`;
        const grantName = 'Field Study';
        const grantNumber = '1234';
        const grantDoi = '10.1234/example';

        // The manager records the two hand-named funders on the posted
        // preprint (posting does not lock the list — Actors & permissions),
        // the first with its fully filled grant, and orders "Second
        // Foundation" first with "Order" / "Save Order". Typed-name path
        // only: the registry funder cannot be produced on this install (A3,
        // the file header), so the ROR-mark link of Rule 9 stays uncovered.
        const managerPage = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(managerPage);
        let funding = await openFunding(managerPage, PK, withFunder.submissionId);
        await funding.addFunder(testFoundation, {
            grants: [{grantName, grantNumber, grantDoi}],
        });
        await funding.addFunder(secondFoundation);
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
        // Foundation" (Rule 7).
        await expect(reader.fundersBlockNames()).toHaveCount(2);
        await expect(reader.fundersBlockNames().first()).toHaveText(secondFoundation);
        await expect(reader.fundersBlockNames().nth(1)).toHaveText(testFoundation);

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
        ).toHaveText('Funders');

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

        // "The Review step at 'Require'": the Author's draft, with no
        // funder declared, walked to its Review step shows "Funders are
        // required." (Rule 11). Whether the submit stays enabled is A1's
        // question: the warning alone is asserted.
        await openDraftDetails(authorPage, tag, draft.submissionId);
        await expect(wizard.wizardFundersSection()).toBeVisible({timeout: 30_000});
        await continueTo(authorPage, STEPS.contributors);
        await continueTo(authorPage, STEPS.readers);
        await setRelationStatus(authorPage);
        await openReview(authorPage);
        await expect(wizard.fundersRequiredWarning()).toHaveText(/Funders are required\./, {
            timeout: 30_000,
        });
        await expect(reviewPanel(authorPage, 'Details')).toContainText('Funders');
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
