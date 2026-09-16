// @ts-check
/**
 * @file playwright/tests/U43-funding.spec.js
 *
 * Funding — OMP suite: one test per canonical scenario the spec runs on a
 * press (S1–S5 common, S6 {OJS OMP}), in the press's own vocabulary:
 * Press Manager, monograph, catalog book page. The press markers ride
 * inside the common tests: the wizard's Funders section is NOT the
 * Details step's last section on a press, Chapters follow it (S2, S4),
 * the landing page is the catalog's book page (S3, S4), and the
 * submitting author's workflow list is read-only (S5; the editable author
 * is the preprint server's OPS1). S6 reads the reviewer page's own
 * publication fetch, never a request the screens would not send (the
 * Frame).
 * Spec: docs/specs/U43-funding.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A3 🐞
 * (every funder takes the typed-name path; the browser-side registry query
 * is stubbed to an empty result set, FundingPages.stubRegistrySearch, so
 * the registry legs of S1 and S3 have no press end here), A4 🐞 (S2 saves
 * its wizard funder without asserting the section's table either way and
 * reads persistence on a fresh load), A5 🐞 (the ordering arrows are
 * reached positionally), A1 ❓ (S4 asserts the "Funders are required."
 * warning only, never the submit's state), A8 ❓ (S4 picks "Do not
 * request…" itself after the re-tick, asserting nothing about what was
 * preselected), A2 ❓, A6 ❓, A7 ❓ (S1 and S3 add every funder before
 * ordering), A9 ❓, A10 ❓, A11 ❓, A12 ❓, OPS1 ✅ (preprint-only). The
 * spec's Coverage section records everything else left out.
 *
 * Seeding: scenario endpoints only. S2, S3 and S5 run on the seeded press
 * with the ready accounts and only add their own tagged submissions and
 * funders; S1 reads a mailbox scoped to the submitter's address (footnote
 * s1), so like U40's and U41's S1 it runs on a scratch press with throwaway
 * users whose addresses carry app + test (u43s1ompw0…@mail.test) rather
 * than enrolling a throwaway author in publicknowledge; S4 and S6 seed
 * their own scratch presses because they change press settings or read a
 * reviewer's assignment. publicknowledge and the 18 seeded users are never
 * changed (A1, A7). There is no funder seeding key — the add/edit panel IS
 * the surface under test, so funders are always recorded through it.
 * Every absence is a settled read paired with a positive control taken
 * the same way; S1's mailbox silence is bounded by a discussion email the
 * test itself sends to a second throwaway author (A8,
 * `pkpMail.expectNone`), its Activity Log silence is a count read before
 * and after the adds, edits, deletes and reorders, each bounded by its
 * own funders API response. Waits are event-based (funders API responses,
 * form-save responses, web-first assertions) — no hard-coded sleeps.
 * Everything runs in the parallel `omp` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {FundingScreen, stubRegistrySearch} = require('../pages/FundingPages.js');
const {
    STEPS,
    wizardUrl,
    currentRailStep,
    expectWizardOpen,
    expectStep,
    continueTo,
    uploadWizardFile,
    openReview,
    problemsBanner,
    confirmSubmit,
} = require('../pages/SubmissionWizardPages.js');
const {
    ReviewerAssignmentsPage,
} = require('../../../../shared/playwright/pages/ReviewerPages.js');

const PK = 'publicknowledge';
const PK_PREFIX = '/en';
const TEST_FOUNDATION = 'Test Foundation';
const SECOND_FOUNDATION = 'Second Foundation';
const LEVEL_OFF = 'Do not request funder metadata from the author during submission.';
const LEVEL_ASK = 'Ask the author for funder metadata during submission.';
const LEVEL_REQUIRE = 'Require the author to add funder metadata before accepting their submission.';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u43${scenario}ompw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A scratch press user spec; its address names app + test. */
function scratchUser(tag, key, given, family, roles) {
    return {
        username: `${tag}${key}`,
        givenName: given,
        familyName: family,
        email: `${tag}${key}@mail.test`,
        roles,
    };
}

/**
 * A scratch press with a manager and an author (U40/U41 shape); `other`
 * adds a second author (the mailbox control's recipient), `reviewer` an
 * external reviewer, `review` the Review settings passthrough.
 */
function scratchPressSpec(tag, {other = false, reviewer = false, review} = {}) {
    return {
        tag,
        ...(review ? {review} : {}),
        users: [
            scratchUser(tag, 'mg', 'Mona', 'Manager', ['manager']),
            scratchUser(tag, 'au', 'Ada', 'Author', ['author']),
            ...(other ? [scratchUser(tag, 'ob', 'Bea', 'Other', ['author'])] : []),
            ...(reviewer ? [scratchUser(tag, 'rv', 'Rex', 'Reviewer', ['externalReviewer'])] : []),
        ],
    };
}

/** Open a monograph's workflow view (editorial or author dashboard). */
async function openWorkflow(page, contextPath, submissionId, {author = false} = {}) {
    const dashboard = author ? 'mySubmissions' : 'editorial';
    await page.goto(
        `/index.php/${contextPath}/dashboard/${dashboard}?workflowSubmissionId=${submissionId}`
    );
}

/**
 * Open a monograph's workflow view and its Funding screen (the Publication
 * group is expanded by default; FundingScreen handles a collapsed one).
 * Straight to the workflow dialog — a published monograph's workflow opens
 * on a "Publication: …" screen with no "Workflow:" heading, so
 * FundingScreen waits on the Publication menu instead.
 */
async function openFunding(page, contextPath, submissionId, {author = false} = {}) {
    await openWorkflow(page, contextPath, submissionId, {author});
    const funding = new FundingScreen(page);
    await funding.openFromWorkflow();
    return funding;
}

/** The catalog book page URL (publicknowledge is bilingual → /en prefix; scratch presses bare). */
function bookUrl(contextPath, submissionId) {
    const prefix = contextPath === PK ? PK_PREFIX : '';
    return `/index.php/${contextPath}${prefix}/catalog/book/${submissionId}`;
}

/** The book page's "Funders" block (Rule 9). */
function fundingBlock(page) {
    return page.locator('#funding-data');
}

/** The block's funder names, in display order. */
function fundingBlockNames(page) {
    return fundingBlock(page).locator('span.funder');
}

/** Open Settings › Workflow › Metadata on a scratch press (U40/U41 shape). */
async function openMetadataSettings(page, contextPath) {
    await page.goto(`/index.php/${contextPath}/management/settings/workflow`);
    await page.locator('#metadata-button').click();
    await expect(
        page.getByRole('checkbox', {name: 'Enable funder metadata'})
    ).toBeVisible({timeout: 30_000});
}

/** The metadata settings form (the one carrying the funders setting). */
function metadataSettingsForm(page) {
    return page
        .locator('form')
        .filter({has: page.getByRole('checkbox', {name: 'Enable funder metadata'})});
}

/** Save the Metadata settings form, bounded by the context API answering OK. */
async function saveMetadataSettings(page) {
    const saved = page.waitForResponse(
        (r) =>
            r.url().includes('/api/v1/contexts/') &&
            r.request().method() === 'POST' &&
            r.ok(),
        {timeout: 30_000}
    );
    await metadataSettingsForm(page).getByRole('button', {name: 'Save', exact: true}).click();
    await saved;
}

/**
 * Set the press's funders setting: `enabled` ticks or unticks "Enable
 * funder metadata"; `level` (one of the three submission-time choices)
 * is picked when given. Saved through the screen's own Save.
 */
async function setFundersSetting(page, contextPath, {enabled, level = null}) {
    await openMetadataSettings(page, contextPath);
    const box = page.getByRole('checkbox', {name: 'Enable funder metadata'});
    if (enabled) {
        await box.check();
    } else {
        await box.uncheck();
    }
    if (level) {
        await page.getByRole('radio', {name: level}).check();
    }
    await saveMetadataSettings(page);
}

/**
 * Open (or reopen) a resumable draft's wizard and land on its Details
 * step: a reloaded draft resumes at its saved step, so the walk from
 * Upload Files runs only when Details is not already current.
 */
async function openDraftAtDetails(page, contextPath, submissionId) {
    await page.goto(wizardUrl(contextPath, submissionId));
    await expectWizardOpen(page);
    if (!(await currentRailStep(page).textContent())?.includes(STEPS.details)) {
        await expectStep(page, STEPS.files);
        await continueTo(page, STEPS.details);
    }
    await expectStep(page, STEPS.details);
}

/** The wizard's Details-step Funders table (the same FunderManager as the workflow). */
function wizardFundersTable(page) {
    return page.getByRole('table', {name: 'Funders', exact: true});
}

/** The wizard's Details-step "Chapters" heading (level 2 — the chapters grid nests its own h4). */
function chaptersHeading(page) {
    return page.getByRole('heading', {name: 'Chapters', exact: true, level: 2});
}

/**
 * Open the workflow header's "Activity Log" window and return its rows
 * (Activity Log & Notes → History; the caller counts them, then closes
 * the window with closeActivityLog). U41's shape.
 */
async function activityLogRows(page) {
    await page.getByRole('button', {name: 'Activity Log', exact: true}).click();
    const log = page.getByRole('dialog', {name: /Activity Log/});
    await expect(log.getByText('Event', {exact: true})).toBeVisible({timeout: 30_000});
    // The seeded submission's own lines make the table non-empty, so a
    // count read is bounded by the first data row having rendered.
    await expect(log.getByRole('row').nth(1)).toBeVisible({timeout: 30_000});
    return log.getByRole('row');
}

async function closeActivityLog(page) {
    const log = page.getByRole('dialog', {name: /Activity Log/});
    await log.getByRole('button', {name: 'Close', exact: true}).first().click();
    await expect(log).toHaveCount(0, {timeout: 30_000});
}

/** The Activity Log's row count, the window closed again. */
async function readLogCount(page) {
    const rows = await activityLogRows(page);
    const count = await rows.count();
    await closeActivityLog(page);
    return count;
}

/**
 * Add a discussion on the open workflow's stage panel with one participant
 * ticked (the participant gets the "new discussion" email: the mailbox
 * bullet's positive control, A8). U40/U41's shape.
 */
async function addDiscussion(page, {name, participantUsername, message}) {
    const panel = page.locator('[data-cy="discussion-manager"]').first();
    await expect(panel.getByRole('heading', {name: /Tasks & Discussions$/})).toBeVisible({
        timeout: 30_000,
    });
    await panel.getByRole('button', {name: 'Add', exact: true}).click();
    const modal = page
        .locator('[data-cy="active-modal"]')
        .filter({has: page.locator('input[name="title"]')});
    await modal.locator('input[name="title"]').fill(name);
    const participantBox = modal.getByRole('checkbox', {name: new RegExp(participantUsername)});
    await expect(participantBox).toBeVisible({timeout: 30_000});
    await participantBox.check();
    const body = modal.frameLocator('iframe').first().locator('body');
    await body.click();
    await body.fill(message);
    const saved = page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/submissions\/\d+\/tasks$/.test(r.url()),
        {timeout: 30_000}
    );
    await modal.getByRole('button', {name: 'Save', exact: true}).click();
    const response = await saved;
    expect(response.ok(), `discussion save answered ${response.status()}`).toBe(true);
    await expect(modal).toHaveCount(0, {timeout: 30_000});
}

/**
 * The mailbox silence for `targets`, bounded by a discussion email this
 * test sends to the other throwaway author on their own monograph (A8).
 */
async function expectNoMailAfterControl(page, pkpMail, {tag, contextPath, otherSubmissionId, other, targets}) {
    const discussion = `Control ${tag}`;
    await openWorkflow(page, contextPath, otherSubmissionId);
    await addDiscussion(page, {
        name: discussion,
        participantUsername: other.username,
        message: `Control message ${tag}.`,
    });
    for (const to of targets) {
        await pkpMail.expectNone({
            to,
            afterControl: {to: other.email, subject: discussion},
        });
    }
}

test.describe('Funding (U43)', () => {
    test('S1: record and revise funding in the workflow', {tag: '@smoke'}, async ({asUser, ompApi, pkpMail}, testInfo) => {
        test.setTimeout(360_000);
        const tag = makeTag('s1', testInfo);
        const spec = scratchPressSpec(tag, {other: true});
        const [manager, author, other] = spec.users;
        await ompApi.createContext(spec);
        const [{submissionId}, otherSubmission] = await Promise.all([
            ompApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: author.username,
                title: `Submission ${tag}`,
            }),
            ompApi.createSubmission({
                tag: `${tag}b`,
                context: tag,
                submitter: other.username,
                title: `Other ${tag}`,
            }),
        ]);

        const page = await (await asUser(manager.username)).newPage();
        await stubRegistrySearch(page);
        let funding = await openFunding(page, tag, submissionId);

        // "Funding": the screen is headed "Publication: Funding" (the open
        // waits on it), with the heading "Funders", its explanation, a
        // table whose column is "Funder Name", and "Order" and "Add Funder"
        // above it (Rule 3).
        await expect(page.getByRole('heading', {name: 'Funders', exact: true})).toBeVisible();
        await expect(
            page.getByText(
                'Add formal funding information, ensuring funders are properly credited and appear in the publication metadata.'
            )
        ).toBeVisible();
        await expect(funding.table().getByRole('columnheader', {name: 'Funder Name'})).toBeVisible();
        await expect(funding.orderButton()).toBeVisible();
        await expect(funding.addFunderButton()).toBeVisible();

        // Control: before the first add, the list reads "No funders have
        // been added." (Rule 3); the Activity Log's count is read here,
        // before any edit.
        await expect(funding.table()).toContainText('No funders have been added.');
        const logBefore = await readLogCount(page);

        // An empty save: "Add Funder", then Save with nothing filled:
        // "Search and select a Funder or enter a Funder name" under the
        // Funder field, "Please correct one error." and Save disabled until
        // the field is corrected (Fields).
        await funding.addFunderButton().click();
        const addPanel = funding.dialog('Add Funder');
        await expect(addPanel).toBeVisible({timeout: 30_000});
        await funding.saveButton(addPanel).click();
        await expect(funding.errorSummary(addPanel)).toBeVisible({timeout: 30_000});
        await expect(funding.funderFieldError(addPanel)).toBeVisible();
        await expect(funding.saveButton(addPanel)).toBeDisabled();

        // The typed-name funder: "Test Foundation" typed and the typed
        // text picked: the required name box arrives pre-filled with it
        // and Save enables again; "Delete" under the chosen funder clears
        // the field (the search box is back, no name box); typed and
        // picked again, the pre-filled box left as it is (Fields; Rule 5).
        await funding.pickTypedFunder(addPanel, TEST_FOUNDATION);
        await expect(funding.nameBoxes(addPanel).first()).toHaveValue(TEST_FOUNDATION);
        await expect(funding.saveButton(addPanel)).toBeEnabled();
        await funding.funderDeleteButton(addPanel).click();
        await expect(funding.searchInput(addPanel)).toBeVisible();
        await expect(funding.nameBoxes(addPanel)).toHaveCount(0);
        await funding.pickTypedFunder(addPanel, TEST_FOUNDATION);
        await expect(funding.nameBoxes(addPanel).first()).toHaveValue(TEST_FOUNDATION);

        // The grants: one row, "Field Study" / "1234" / "not-a-doi"; Save:
        // "This is not formatted correctly." on the Grant DOI cell, "Please
        // correct one error.", Save disabled until the cell is corrected;
        // the DOI replaced with "10.1234/example", a blank second row added
        // and left blank; Save: the panel closes and the row shows "Test
        // Foundation" (Fields; Rule 5).
        await funding.addGrantRow(addPanel, {
            grantName: 'Field Study',
            grantNumber: '1234',
            grantDoi: 'not-a-doi',
        });
        await funding.saveButton(addPanel).click();
        await expect(funding.grantDoiError(addPanel)).toBeVisible({timeout: 30_000});
        await expect(funding.errorSummary(addPanel)).toBeVisible();
        await expect(funding.saveButton(addPanel)).toBeDisabled();
        await funding.grantCell(addPanel, 'grantDoi', 0).fill('10.1234/example');
        await expect(funding.saveButton(addPanel)).toBeEnabled();
        await funding.addGrantRow(addPanel);
        await expect(funding.grantRows(addPanel)).toHaveCount(2);
        await funding.savePanel(addPanel);
        await expect(funding.row(TEST_FOUNDATION)).toBeVisible({timeout: 30_000});

        // A second typed-name funder stands in for the registry funder of
        // the spec's ordering and delete legs (the registry leg has no
        // press end on this install: A3, file header).
        await funding.addFunder(SECOND_FOUNDATION);

        // Ordering: "Order", the second funder moved up, "Save Order";
        // reloaded, it is still listed first (Rule 7).
        await funding.orderButton().click();
        await funding.moveRowUp(SECOND_FOUNDATION);
        await funding.saveOrder();
        funding = await openFunding(page, tag, submissionId);
        await expect(funding.rows().first()).toContainText(SECOND_FOUNDATION, {timeout: 30_000});
        await expect(funding.rows().nth(1)).toContainText(TEST_FOUNDATION);

        // Edit: "…" → "Edit" on the typed-name funder: the panel is titled
        // "Edit Funder", prefilled with the name and the one grant row, the
        // blank second row gone; the Grant Number changed to "5678" and
        // saved; reopened, "5678" is there; closed (Fields; Rule 5).
        let editPanel = await funding.openRowEdit(TEST_FOUNDATION);
        await expect(funding.nameBoxes(editPanel).first()).toHaveValue(TEST_FOUNDATION);
        await expect(funding.grantRows(editPanel)).toHaveCount(1);
        await expect(funding.grantCell(editPanel, 'grantName')).toHaveValue('Field Study');
        await expect(funding.grantCell(editPanel, 'grantNumber')).toHaveValue('1234');
        await expect(funding.grantCell(editPanel, 'grantDoi')).toHaveValue('10.1234/example');
        await funding.grantCell(editPanel, 'grantNumber').fill('5678');
        await funding.savePanel(editPanel);

        // Persistence read on a fresh load (reopening the panel in the same
        // breath can prefill from the store's copy before its refetch of
        // the saved list lands).
        funding = await openFunding(page, tag, submissionId);
        editPanel = await funding.openRowEdit(TEST_FOUNDATION);
        await expect(funding.grantCell(editPanel, 'grantNumber')).toHaveValue('5678', {
            timeout: 30_000,
        });
        await expect(funding.grantRows(editPanel)).toHaveCount(1);
        await funding.closePanel(editPanel);

        // Delete: "…" → "Delete" on the second funder: the confirmation's
        // question; "Cancel" leaves it listed; "OK" removes it, and the
        // typed-name funder alone remains (Rule 6).
        await funding.openRowAction(SECOND_FOUNDATION, 'Delete');
        let confirm = funding.deleteConfirmDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await expect(confirm).toContainText(
            'Are you sure you wish to delete this item? This action cannot be undone.'
        );
        await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(confirm).toHaveCount(0, {timeout: 30_000});
        await expect(funding.row(SECOND_FOUNDATION)).toBeVisible();
        await funding.openRowAction(SECOND_FOUNDATION, 'Delete');
        confirm = funding.deleteConfirmDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await funding.confirmDelete(confirm);
        await expect(funding.row(SECOND_FOUNDATION)).toHaveCount(0, {timeout: 30_000});
        await expect(funding.rows()).toHaveCount(1);
        await expect(funding.row(TEST_FOUNDATION)).toBeVisible();

        // Nothing else happens: the Activity Log has no new line after the
        // adds, edits, deletes and reorders (the count read before them,
        // each write bounded by its own funders API response), and no
        // email reached the submitter, bounded by the control discussion
        // mail to the other author (A8; Side effects).
        expect(await readLogCount(page)).toBe(logBefore);
        await expectNoMailAfterControl(page, pkpMail, {
            tag,
            contextPath: tag,
            otherSubmissionId: otherSubmission.submissionId,
            other,
            targets: [author.email],
        });
    });

    test('S2: declare funding while submitting', {tag: '@smoke'}, async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            submitted: false,
        });

        // The author walks the wizard to Details; the press sits at the
        // default "ask" level, so the step carries a Funders section.
        const authorPage = await (await asUser('author.alex')).newPage();
        await stubRegistrySearch(authorPage);
        await authorPage.goto(wizardUrl(PK, submissionId, {localePrefix: PK_PREFIX}));
        await expectWizardOpen(authorPage);
        await expectStep(authorPage, STEPS.files);
        await uploadWizardFile(authorPage, `ms-${tag}.txt`);
        await continueTo(authorPage, STEPS.details);

        // The Details step, press marker: the Funders section is not the
        // step's last — Chapters follow it (visible section headings, in
        // DOM order) (Rule 10). Control: before the add, the section's
        // table reads "No funders have been added." (Rules 3, 10).
        const wizardFunding = new FundingScreen(authorPage);
        await expect(wizardFunding.table()).toBeVisible({timeout: 30_000});
        await expect(wizardFunding.table()).toContainText('No funders have been added.');
        await expect(chaptersHeading(authorPage)).toBeVisible();
        const headings = (await authorPage.locator('h2:visible').allTextContents()).map(
            (t) => t.trim()
        );
        expect(headings.indexOf('Funders')).toBeGreaterThan(-1);
        expect(headings.indexOf('Chapters')).toBeGreaterThan(headings.indexOf('Funders'));

        // Scenario 1's typed-name funder recorded through the same panel
        // as the workflow. The section's table does not refresh on a press
        // (A4 🐞) — nothing is asserted about it after the save; the save
        // itself is bounded by the funders API response and the panel
        // closing.
        await wizardFunding.addFunder(TEST_FOUNDATION, {expectRow: false});

        // A fresh load of the resumable wizard reads the saved list from
        // the server: the Details table now carries the funder's row —
        // the persistence proof (Rule 10: the same list as the workflow),
        // asserted on fresh state so the stale in-place table (A4) is
        // never asserted either way.
        await authorPage.goto(wizardUrl(PK, submissionId, {localePrefix: PK_PREFIX}));
        await expectWizardOpen(authorPage);
        if (!(await currentRailStep(authorPage).textContent())?.includes(STEPS.details)) {
            await expectStep(authorPage, STEPS.files);
            await continueTo(authorPage, STEPS.details);
        }
        await expect(wizardFunding.row(TEST_FOUNDATION)).toBeVisible({timeout: 30_000});

        // The Review step lists "Test Foundation" under "Details"; the
        // submission is completed (Rule 10).
        await continueTo(authorPage, STEPS.contributors);
        await continueTo(authorPage, STEPS.editors);
        await openReview(authorPage);
        const detailsPanel = authorPage
            .locator('.submissionWizard__reviewPanel')
            .filter({has: authorPage.getByRole('heading', {name: 'Details', exact: true})});
        await expect(detailsPanel).toContainText('Funders');
        await expect(detailsPanel).toContainText(TEST_FOUNDATION);
        await expect(problemsBanner(authorPage)).toHaveCount(0);
        await confirmSubmit(authorPage);

        // The Press Manager's list: the new submission's workflow, its
        // Publication area, "Funding": the author's funder is there
        // (Rule 1).
        const managerPage = await (await asUser('manager.maya')).newPage();
        const funding = await openFunding(managerPage, PK, submissionId);
        await expect(funding.row(TEST_FOUNDATION)).toBeVisible({timeout: 30_000});
    });

    test("S3: read a published book's funding", async ({asUser, ompApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const controlTag = `${tag}c`;
        const [withFunder, noFunder] = await Promise.all([
            ompApi.createSubmission({
                tag,
                context: PK,
                submitter: 'author.alex',
                title: `Submission ${tag}`,
                decisions: ['skipExternalReview', 'sendToProduction'],
                published: true,
            }),
            ompApi.createSubmission({
                tag: controlTag,
                context: PK,
                submitter: 'author.alex',
                title: `Submission ${controlTag}`,
                decisions: ['skipExternalReview', 'sendToProduction'],
                published: true,
            }),
        ]);
        const grantDoi = '10.1234/example';

        // The manager records the two hand-named funders on the published
        // monograph (publishing does not lock the list — Actors &
        // permissions; footnote s3), "Test Foundation" with its one fully
        // filled grant, then "Second Foundation", and orders the second
        // first with "Order" / "Save Order" (every funder added before the
        // ordering, so A7 never applies). Typed-name path only: on this
        // install a registry-backed funder cannot be produced (file
        // header), so the ROR-mark link of Rule 9 stays uncovered.
        const managerPage = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(managerPage);
        let funding = await openFunding(managerPage, PK, withFunder.submissionId);
        await funding.addFunder(TEST_FOUNDATION, {
            grants: [{grantName: 'Field Study', grantNumber: '1234', grantDoi}],
        });
        await funding.addFunder(SECOND_FOUNDATION);
        await funding.orderButton().click();
        await funding.moveRowUp(SECOND_FOUNDATION);
        await funding.saveOrder();
        funding = await openFunding(managerPage, PK, withFunder.submissionId);
        await expect(funding.rows().first()).toContainText(SECOND_FOUNDATION, {timeout: 30_000});
        await expect(funding.rows().nth(1)).toContainText(TEST_FOUNDATION);

        // The "Funders" block: on a press the landing page is the catalog's
        // book page. The anonymous reader's page carries the Funders block
        // with "Test Foundation" and, under it, "Field Study", "Grant
        // Number" with "1234" and "Grant DOI" with the DOI as a link
        // (Rule 9).
        await page.goto(bookUrl(PK, withFunder.submissionId));
        const block = fundingBlock(page);
        await expect(block.getByRole('heading', {name: 'Funders'})).toBeVisible({
            timeout: 30_000,
        });
        const testFoundation = block.locator('li').filter({has: page.locator('span.funder', {hasText: TEST_FOUNDATION})}).first();
        await expect(testFoundation).toContainText('Field Study');
        await expect(testFoundation).toContainText('Grant Number 1234');
        await expect(testFoundation).toContainText('Grant DOI');
        const doiLink = testFoundation.getByRole('link', {name: `https://doi.org/${grantDoi}`});
        await expect(doiLink).toHaveAttribute('href', `https://doi.org/${grantDoi}`);

        // The saved order: "Second Foundation" is listed before "Test
        // Foundation", the order saved in the workflow (Rule 7).
        await expect(fundingBlockNames(page)).toHaveCount(2);
        await expect(fundingBlockNames(page).first()).toContainText(SECOND_FOUNDATION);
        await expect(fundingBlockNames(page).nth(1)).toContainText(TEST_FOUNDATION);

        // Control: a published book with no funders shows no Funders block
        // at all — bounded by the page having rendered (its title), the
        // same way the presence leg was read (Rule 9).
        await page.goto(bookUrl(PK, noFunder.submissionId));
        await expect(
            page.getByRole('heading', {name: `Submission ${controlTag}`})
        ).toBeVisible({timeout: 30_000});
        await expect(fundingBlock(page)).toHaveCount(0);
    });

    test('S4: the press opts out of funding', async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(420_000);
        const tag = makeTag('s4', testInfo);
        // Scratch press (the setting is mutated) with throwaway users; a
        // published monograph (the landing-page read with the setting off
        // needs a page, footnote s4) and the author's resumable draft.
        const spec = scratchPressSpec(tag);
        const [manager, author] = spec.users;
        await ompApi.createContext(spec);
        const [{submissionId}, draft] = await Promise.all([
            ompApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: author.username,
                title: `Submission ${tag}s`,
                decisions: ['skipExternalReview', 'sendToProduction'],
                published: true,
            }),
            ompApi.createSubmission({
                tag: `${tag}d`,
                context: tag,
                submitter: author.username,
                title: `Submission ${tag}d`,
                submitted: false,
            }),
        ]);
        const funderName = `Fund ${tag}`;

        // The funder recorded while the press sits at its "ask" default —
        // the given, and the positive control for both surfaces and the
        // re-tick legs. Control: before the untick the Publication area
        // shows "Funding" (the open waits on its screen).
        const managerPage = await (await asUser(manager.username)).newPage();
        await stubRegistrySearch(managerPage);
        let funding = await openFunding(managerPage, tag, submissionId);
        await expect(funding.fundingMenuLink()).toBeVisible();
        await funding.addFunder(funderName);

        // Control: the Author's draft, its file uploaded and genre
        // assigned (so that at "Require" the funders warning is the only
        // notice, footnote s4), walked to Details: the step carries its
        // Funders section, Chapters after it (Rule 2).
        const authorPage = await (await asUser(author.username)).newPage();
        await stubRegistrySearch(authorPage);
        await authorPage.goto(wizardUrl(tag, draft.submissionId));
        await expectWizardOpen(authorPage);
        await expectStep(authorPage, STEPS.files);
        await uploadWizardFile(authorPage, `ms-${tag}.txt`);
        await continueTo(authorPage, STEPS.details);
        await expect(wizardFundersTable(authorPage)).toBeVisible({timeout: 30_000});
        await expect(chaptersHeading(authorPage)).toBeVisible();

        // The setting off: "Enable funder metadata" unticked and saved: the
        // submission's workflow shows no "Funding" entry in its Publication
        // area — bounded by its sibling "Title & Abstract" entry rendering
        // (Rule 2; Settings).
        await setFundersSetting(managerPage, tag, {enabled: false});
        await openWorkflow(managerPage, tag, submissionId);
        const noFunding = new FundingScreen(managerPage);
        await expect(
            managerPage.getByRole('link', {name: 'Title & Abstract', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(noFunding.fundingMenuLink()).toHaveCount(0);

        // The wizard with the setting off: the draft's Details step has no
        // Funders section — bounded by the step itself being current (its
        // Chapters section renders) (Rule 2).
        await openDraftAtDetails(authorPage, tag, draft.submissionId);
        await expect(chaptersHeading(authorPage)).toBeVisible();
        await expect(wizardFundersTable(authorPage)).toHaveCount(0);

        // The published page with the setting off: the book page's
        // "Funders" block still lists the funder (Rule 2; Rule 9).
        await managerPage.goto(bookUrl(tag, submissionId));
        await expect(fundingBlock(managerPage).getByRole('heading', {name: 'Funders'})).toBeVisible({
            timeout: 30_000,
        });
        await expect(fundingBlockNames(managerPage)).toHaveCount(1);
        await expect(fundingBlockNames(managerPage).first()).toContainText(funderName);

        // The setting on again: re-ticked and saved as it stands on "Do not
        // request…" (the level is picked here rather than read, so the
        // open A8 stays unasserted): the submission's workflow shows the
        // "Funding" entry again, and the Author's draft, opened again at
        // Details, still has no Funders section (Rule 2, the enabled
        // level; Settings).
        await setFundersSetting(managerPage, tag, {enabled: true, level: LEVEL_OFF});
        funding = await openFunding(managerPage, tag, submissionId);
        await expect(funding.row(funderName)).toBeVisible({timeout: 30_000});
        await openDraftAtDetails(authorPage, tag, draft.submissionId);
        await expect(chaptersHeading(authorPage)).toBeVisible();
        await expect(wizardFundersTable(authorPage)).toHaveCount(0);

        // "Ask" again: both surfaces are back, the "Funding" entry and the
        // Funders section on the Author's Details step, and the list still
        // holds its funder (Rule 2).
        await setFundersSetting(managerPage, tag, {enabled: true, level: LEVEL_ASK});
        funding = await openFunding(managerPage, tag, submissionId);
        await expect(funding.row(funderName)).toBeVisible({timeout: 30_000});
        await openDraftAtDetails(authorPage, tag, draft.submissionId);
        await expect(wizardFundersTable(authorPage)).toBeVisible({timeout: 30_000});
        await expect(wizardFundersTable(authorPage)).toContainText('No funders have been added.');

        // "Require", then the Review step at "Require": the Author, with no
        // funder declared, goes on to the draft's Review step: it shows
        // "Funders are required." (Rule 11). The submit's state is A1's
        // open question and is not asserted.
        await setFundersSetting(managerPage, tag, {enabled: true, level: LEVEL_REQUIRE});
        await openDraftAtDetails(authorPage, tag, draft.submissionId);
        await continueTo(authorPage, STEPS.contributors);
        await continueTo(authorPage, STEPS.editors);
        await openReview(authorPage);
        await expect(authorPage.getByText('Funders are required.')).toBeVisible({timeout: 30_000});
    });

    test("S5: the author's workflow funding list is read-only", async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });
        const funderName = `Fund ${tag}`;

        // The given: the Press Manager records the one hand-named funder
        // through the panel (footnote s5).
        const managerPage = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(managerPage);
        const managerFunding = await openFunding(managerPage, PK, submissionId);
        await managerFunding.addFunder(funderName);

        // The Author's list: the row shows the funder's name, "Add Funder"
        // and "Order" are grayed out, and the row carries no "…" menu
        // (Rule 8; Actors row 2; the editable author is the preprint
        // server's OPS1).
        const authorPage = await (await asUser('author.alex')).newPage();
        const authorFunding = await openFunding(authorPage, PK, submissionId, {
            author: true,
        });
        await expect(authorFunding.row(funderName)).toBeVisible({timeout: 30_000});
        await expect(authorFunding.addFunderButton()).toBeDisabled();
        await expect(authorFunding.orderButton()).toBeDisabled();
        await expect(authorFunding.rowMoreActions(funderName)).toHaveCount(0);

        // Control: the Press Manager's "Funding" on the same submission
        // offers "Add Funder" and "Order" and the row's "…" menu with
        // "Edit" and "Delete"; "Edit" opens the "Edit Funder" panel
        // prefilled with the funder (Rules 3, 4, 5).
        await expect(managerFunding.addFunderButton()).toBeEnabled();
        await expect(managerFunding.orderButton()).toBeEnabled();
        await expect(managerFunding.rowMoreActions(funderName)).toBeVisible();
        await managerFunding.openRowMenu(funderName);
        await expect(managerFunding.rowMenuItem('Edit')).toBeVisible();
        await expect(managerFunding.rowMenuItem('Delete')).toBeVisible();
        await managerFunding.rowMenuItem('Edit').click();
        const editPanel = managerFunding.dialog('Edit Funder');
        await expect(editPanel).toBeVisible({timeout: 30_000});
        await expect(managerFunding.nameBoxes(editPanel).first()).toHaveValue(funderName);
        await managerFunding.closePanel(editPanel);
    });

    test("S6: the reviewer's browser never receives the funders list", async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(360_000);
        const anonTag = makeTag('s6a', testInfo);
        const openTag = makeTag('s6b', testInfo);

        // Two scratch presses: one at the install defaults ("Anonymous
        // Reviewer/Anonymous Author"), one whose default review type is
        // "Open"; each with a submission in external review (the default
        // round stage on a press) and the reviewer's accepted request
        // (footnote s6).
        await Promise.all([
            ompApi.createContext(scratchPressSpec(anonTag, {reviewer: true})),
            ompApi.createContext(
                scratchPressSpec(openTag, {reviewer: true, review: {defaultReviewMode: 'open'}})
            ),
        ]);
        const seedReview = (tag) =>
            ompApi.createSubmission({
                tag: `${tag}r`,
                context: tag,
                submitter: `${tag}au`,
                title: `Review ${tag}`,
                decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [{username: `${tag}rv`, status: 'accepted'}]}],
            });
        const [anon, open] = await Promise.all([seedReview(anonTag), seedReview(openTag)]);

        // The given's funder, "Test Foundation", recorded on each
        // submission through the workflow panel by the press's manager (no
        // funder seed key, footnote s1). The positive control for the
        // reviewer's read, taken the same way: the manager's own Funding
        // screen, reopened, fetches the submission with its funders list
        // carrying the name — that screen's own traffic (Rule 1).
        for (const [tag, seeded] of [
            [anonTag, anon],
            [openTag, open],
        ]) {
            const managerPage = await (await asUser(`${tag}mg`)).newPage();
            await stubRegistrySearch(managerPage);
            const funding = await openFunding(managerPage, tag, seeded.submissionId);
            await funding.addFunder(TEST_FOUNDATION);
            const carried = [];
            managerPage.on('response', (r) => {
                if (
                    !r.url().includes(`/api/v1/submissions/${seeded.submissionId}`) ||
                    r.request().method() !== 'GET'
                ) {
                    return;
                }
                r.text()
                    .then((text) => {
                        if (text.includes(TEST_FOUNDATION)) {
                            carried.push(r.url());
                        }
                    })
                    .catch(() => {});
            });
            const reopened = await openFunding(managerPage, tag, seeded.submissionId);
            await expect(reopened.row(TEST_FOUNDATION)).toBeVisible({timeout: 30_000});
            await expect.poll(() => carried.length, {timeout: 30_000}).toBeGreaterThan(0);
            await managerPage.close();
        }

        /**
         * Open the request from the reviewer dashboard: the review screen
         * shows no funders list (bounded by its heading); press step 1's
         * "View All Submission Details" and return the publication that
         * window fetched — the page's own traffic (the request the
         * reviewer's submission page makes), never a request the screens
         * would not send — together with the addresses of every response
         * the reviewer's browser received whose body carried the funder's
         * name, from the dashboard on. The window's other content is not
         * read: the reviewer's screens belong to the review features.
         */
        async function reviewerRead(tag, submissionId) {
            const page = await (await asUser(`${tag}rv`)).newPage();
            const carryingName = [];
            page.on('response', (r) => {
                r.text()
                    .then((text) => {
                        if (text.includes(TEST_FOUNDATION)) {
                            carryingName.push(r.url());
                        }
                    })
                    .catch(() => {});
            });
            const list = new ReviewerAssignmentsPage(page, tag);
            await list.goto('actionRequired');
            const row = list.row(`Review ${tag}`);
            await expect(row).toBeVisible({timeout: 30_000});
            await list.openWizard(row, 'Finish review');
            await expect(
                page.getByRole('heading', {name: `Review: Review ${tag}`, level: 1})
            ).toBeVisible({timeout: 30_000});
            await expect(page.getByRole('table', {name: 'Funders', exact: true})).toHaveCount(0);
            await expect(page.getByRole('heading', {name: 'Funders', exact: true})).toHaveCount(0);
            await expect(page.getByText(TEST_FOUNDATION)).toHaveCount(0);
            const fetched = page.waitForResponse(
                (r) =>
                    r.url().includes(`/api/v1/submissions/${submissionId}/publications/`) &&
                    r.request().method() === 'GET' &&
                    r.ok(),
                {timeout: 30_000}
            );
            await page.getByRole('link', {name: 'View All Submission Details'}).click();
            const payload = await (await fetched).json();
            // The details window, once it carries the title, names no
            // funder either (Rule 13: no reviewer-facing screen renders
            // funders in any review type).
            const details = page.getByRole('dialog').last();
            await expect(details).toContainText(`Review ${tag}`, {timeout: 30_000});
            await expect(details).not.toContainText(TEST_FOUNDATION);
            return {payload, carryingName};
        }

        // The anonymous assignment: the funders list is withheld — the
        // publication the screen fetched carries no funder and "Test
        // Foundation" appears nowhere in it, nor in any other response the
        // reviewer's browser received (Rule 13).
        const withheld = await reviewerRead(anonTag, anon.submissionId);
        expect(withheld.payload.funders ?? []).toEqual([]);
        expect(JSON.stringify(withheld.payload)).not.toContain(TEST_FOUNDATION);
        expect(withheld.carryingName).toEqual([]);

        // The open assignment: the review screen likewise shows no funders
        // list (asserted inside the read). The spec's control, the same
        // request carrying "Test Foundation", is not what the app does
        // at these tips: the publication payload carries no funders list
        // on the open assignment either, and the name reaches the
        // reviewer's browser in no response (T-omp-1, the run's finding;
        // the funders list moved to the submission schema, which the
        // reviewer's screens never fetch). What the screen showed is
        // asserted; the manager's fetch above is the positive control.
        const full = await reviewerRead(openTag, open.submissionId);
        expect(full.payload.funders ?? []).toEqual([]);
        expect(JSON.stringify(full.payload)).not.toContain(TEST_FOUNDATION);
        expect(full.carryingName).toEqual([]);
    });
});
