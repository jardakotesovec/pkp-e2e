// @ts-check
/**
 * @file playwright/tests/U43-funding.spec.js
 *
 * Funding — OPS suite, one test per canonical COMMON scenario the spec runs
 * on a preprint server (scenarios 1–4, in OPS vocabulary: preprint server,
 * preprint, the posted preprint's page; the workflow's Publication-area nav
 * group is labeled "Preprint" — Rule 3) plus the spec's OPS-specific
 * scenario: OPS1 ✅ — the submitting author EDITS their own not-yet-posted
 * preprint's funders list (the app-intended variance; on OJS/OMP the
 * author's workflow list is read-only).
 * Spec: docs/specs/U43-funding.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - The registry-pick leg of scenario 1 (a funder fixed to its ROR registry
 *   record, the row's ROR mark, the preprint page's registry link): on this
 *   install the server has no outbound internet, so a registry pick
 *   deterministically fails per A3 🐞 — and a 🐞 finding is never asserted
 *   as contract. Every funder here takes the typed-name path; the working
 *   registry path stays open under A10 ❓.
 * - A4 🐞 (the OMP/OPS wizard's funders table does not refresh after a
 *   save): S2 saves its wizard funder WITHOUT asserting the table either
 *   way (`expectRow: false`); persistence is asserted on a FRESH load of
 *   the resumable wizard and in the workflow instead.
 * - A1 ❓ (does "require" block submission?): the require level is not
 *   exercised; S2 runs at the default "ask" level.
 * - A2 ❓ (funders shared across publication versions), A6 ❓ (typed-text
 *   suggestion masquerade), A7 ❓ (new funder jumps ahead of a saved order
 *   — S1 adds every funder BEFORE ordering so the test never rides that
 *   behavior), A8 ❓ (forgotten request level — S4 re-picks the radio
 *   without asserting what was or wasn't preselected), A9 ❓ (silent failed
 *   search) and A11 ❓ (grant-number rejection message; grant validation
 *   additionally needs server-side internet) are open questions, not
 *   coverage gaps.
 * - A5 🐞: the ordering arrows' missing accessible names are why S1 reaches
 *   them positionally; nothing asserts their (broken) accessibility.
 * - Rule 13 (funders withheld from anonymized review): OPS ships no review
 *   machinery by design (spec baseline), so the rule has no OPS surface at
 *   all — nothing to cover here.
 * - Whether the OPS author's list stays editable AFTER posting: the spec
 *   scopes OPS1 to the not-yet-posted preprint and says nothing about the
 *   posted case, so OPS1 here stops before posting.
 * - Side-effect silence ("no email, no notification, no activity-log
 *   entry"): a mail/notification-silence claim with no natural in-test
 *   positive control; not asserted (no Mailpit use in this suite).
 * - The Funding Statement / Data Availability fields and the metadata
 *   export/DOI surfaces belong to other features (spec Cross-feature
 *   interactions).
 *
 * Hermeticity: the Funder field queries the public ROR registry from the
 * BROWSER; the suite stubs that query to an empty result set
 * (FundingPages.stubRegistrySearch) so no test depends on api.ror.org —
 * the typed-name path under test renders its typed-text option
 * independently of the suggestions payload.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only (the settings mutation of S4 runs on a scratch preprint
 * server with throwaway users). There is no funder seeding key — the
 * add/edit panel IS the surface under test, so funders are always recorded
 * through it. Waits are event-based (funders API responses, form-save
 * responses, web-first assertions) — no hard-coded sleeps. Everything runs
 * in the parallel `ops` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {FundingScreen, stubRegistrySearch} = require('../pages/FundingPages.js');
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

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u43${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Open a preprint's workflow view and its Funding screen (the "Preprint"
 * nav group is expanded by default; FundingScreen handles a collapsed one).
 * Straight to the workflow dialog — a posted preprint's workflow opens on a
 * "Publication: …" screen with no "Workflow:" heading, so FundingScreen
 * waits on the Preprint menu instead.
 */
async function openFunding(page, contextPath, submissionId, {author = false} = {}) {
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

test.describe('Funding (U43)', () => {
    test('S1: record and revise funding in the workflow', {tag: '@smoke'}, async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });
        const nameA = `Alpha ${tag}`;
        const nameB = `Beta ${tag}`;

        const page = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(page);
        let funding = await openFunding(page, PK, submissionId);

        // Rule 3: the screen's fixed furniture around an empty list.
        await expect(
            page.getByText(
                'Add formal funding information, ensuring funders are properly credited and appear in the publication metadata.'
            )
        ).toBeVisible();
        await expect(funding.table()).toContainText('No funders have been added.');

        // Add the first funder — an empty save is refused in place (Fields &
        // validation): summary, field message, Save disabled.
        await funding.addFunderButton().click();
        const addPanel = funding.dialog('Add Funder');
        await expect(addPanel).toBeVisible({timeout: 30_000});
        await addPanel.getByRole('button', {name: 'Save', exact: true}).click();
        await expect(addPanel.getByText('Please correct one error.')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            addPanel.getByText('Search and select a Funder or enter a Funder name').first()
        ).toBeVisible();
        await expect(addPanel.getByRole('button', {name: 'Save', exact: true})).toBeDisabled();

        // Correcting the field (typed-name path) re-enables Save; one grant
        // row rides along (name, number, DOI in the required shape).
        await funding.fillTypedFunderName(addPanel, nameA);
        await funding.addGrantRow(addPanel, {
            grantName: `Grant ${tag}`,
            grantNumber: 'GN1111',
            grantDoi: `10.1234/${tag}`,
        });
        await funding.savePanel(addPanel);
        await expect(funding.row(nameA)).toBeVisible({timeout: 30_000});

        // A second typed-name funder (the spec's registry leg is not
        // exercised here — see the file header).
        await funding.addFunder(nameB);

        // Rule 7: ordering. Move the second funder up and save; the row's
        // up/down buttons carry no accessible name (A5 🐞), so they are
        // reached positionally — first button in the row is "up".
        await funding.orderButton().click();
        await funding.row(nameB).locator('button').first().click();
        const orderSaved = page.waitForResponse(
            (r) =>
                r.url().includes('/funders/order') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await funding.saveOrderButton().click();
        await orderSaved;

        // Reload: the order holds.
        funding = await openFunding(page, PK, submissionId);
        await expect(funding.rows().first()).toContainText(nameB, {timeout: 30_000});
        await expect(funding.rows().nth(1)).toContainText(nameA);

        // Rule 5: Edit opens the same panel prefilled; change the grant
        // number and save; reopening shows the change persisted.
        await funding.openRowAction(nameA, 'Edit');
        let editPanel = funding.dialog('Edit Funder');
        await expect(editPanel).toBeVisible({timeout: 30_000});
        await expect(editPanel.locator('input[name="name"]').first()).toHaveValue(nameA);
        await expect(editPanel.locator('input[name="grantNumber"]')).toHaveValue('GN1111');
        await expect(editPanel.locator('input[name="grantName"]')).toHaveValue(`Grant ${tag}`);
        await editPanel.locator('input[name="grantNumber"]').fill('GN2222');
        await funding.savePanel(editPanel);

        // Persistence read on a fresh load (reopening the panel in the same
        // breath can prefill from the store's copy before its refetch of
        // the saved list lands).
        funding = await openFunding(page, PK, submissionId);
        await funding.openRowAction(nameA, 'Edit');
        editPanel = funding.dialog('Edit Funder');
        await expect(editPanel.locator('input[name="grantNumber"]')).toHaveValue('GN2222', {
            timeout: 30_000,
        });
        await editPanel.getByRole('button', {name: 'Close'}).click();
        await expect(editPanel).toHaveCount(0, {timeout: 30_000});

        // Rule 6: Delete asks for confirmation; Cancel leaves everything
        // untouched, OK removes the funder.
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
        const funderName = `Fund ${tag}`;

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

        // Rule 10: the step carries the same list and add/edit panel as the
        // workflow. Add the funder there. The section's table does not
        // refresh on a preprint server (A4 🐞) — nothing is asserted about
        // it after the save; the save itself is bounded by the funders API
        // response and the panel closing.
        const wizardFunding = new FundingScreen(authorPage);
        await expect(wizardFunding.table()).toBeVisible({timeout: 30_000});
        await expect(wizardFunding.table()).toContainText('No funders have been added.');
        await wizardFunding.addFunder(funderName, {expectRow: false});

        // A fresh load of the resumable wizard reads the saved list from
        // the server: the Details table now carries the funder's row —
        // the persistence proof (Rule 10: the same list as the workflow),
        // asserted on fresh state so the stale in-place table (A4) is
        // never asserted either way.
        await authorPage.goto(wizardUrl(PK, submissionId, {localePrefix: PK_PREFIX}));
        await expectWizardOpen(authorPage);
        if (!(await currentRailStep(authorPage).textContent())?.includes('Details')) {
            await expectStep(authorPage, STEPS.files);
            await continueTo(authorPage, STEPS.details);
        }
        await expect(wizardFunding.row(funderName)).toBeVisible({timeout: 30_000});

        // The Review step lists the funder's name under "Details" (Rule 10);
        // the For Readers step's required Relation status is answered on the
        // way (the wizard shell's own requirement, not funding's).
        await continueTo(authorPage, STEPS.contributors);
        await continueTo(authorPage, STEPS.readers);
        await setRelationStatus(authorPage);
        await openReview(authorPage);
        const detailsPanel = reviewPanel(authorPage, 'Details');
        await expect(detailsPanel).toContainText('Funders');
        await expect(detailsPanel).toContainText(funderName);

        await expect(problemsBanner(authorPage)).toHaveCount(0);
        await confirmSubmit(authorPage, {message: SUBMIT_DIALOGS.moderated});

        // The Preprint Server Manager finds the author's funder on the
        // workflow's Funding screen (Rule 1: one list per submission).
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
        const funderName = `Fund ${tag}`;
        const grantName = `Grant ${tag}`;
        const grantNumber = 'GN9876';
        const grantDoi = `10.1234/${tag}`;

        // The manager records the funder on the posted preprint (posting
        // does not lock the list — Actors & permissions) with a fully
        // filled grant. Typed-name path: on this install a registry-backed
        // funder cannot be produced (see the file header), so the ROR-mark
        // link of Rule 9 stays uncovered.
        const managerPage = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(managerPage);
        const funding = await openFunding(managerPage, PK, withFunder.submissionId);
        await funding.addFunder(funderName, {
            grants: [{grantName, grantNumber, grantDoi}],
        });

        // Rule 9, presence: on a preprint server the landing page is the
        // preprint's page. The anonymous reader's page carries the Funders
        // block with the funder's name and the grant's name, number and DOI
        // (a working doi.org link).
        await page.goto(
            `/index.php/${PK}${PK_PREFIX}/preprint/view/${withFunder.submissionId}`
        );
        const block = page.locator('#funding-data');
        await expect(block.getByRole('heading', {name: 'Funders'})).toBeVisible({
            timeout: 30_000,
        });
        await expect(block).toContainText(funderName);
        await expect(block).toContainText(grantName);
        await expect(block).toContainText('Grant Number');
        await expect(block).toContainText(grantNumber);
        const doiLink = block.getByRole('link', {name: `https://doi.org/${grantDoi}`});
        await expect(doiLink).toHaveAttribute('href', `https://doi.org/${grantDoi}`);

        // Rule 9, absence: a posted preprint with no funders shows no
        // Funders block at all — bounded by the page having rendered
        // (its title), the same way the presence leg was read.
        await page.goto(
            `/index.php/${PK}${PK_PREFIX}/preprint/view/${noFunder.submissionId}`
        );
        await expect(
            page.getByRole('heading', {name: `Submission ${controlTag}`})
        ).toBeVisible({timeout: 30_000});
        await expect(page.locator('#funding-data')).toHaveCount(0);
    });

    test('S4: the server opts out of funding', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        // Scratch preprint server (the setting is mutated) with throwaway
        // users.
        await opsApi.createContext({
            tag,
            users: [
                {
                    username: `${tag}mg`,
                    givenName: 'Mona',
                    familyName: 'Manager',
                    email: `${tag}mg@mail.test`,
                    roles: ['manager'],
                },
                {
                    username: `${tag}au`,
                    givenName: 'Ada',
                    familyName: 'Author',
                    email: `${tag}au@mail.test`,
                    roles: ['author'],
                },
            ],
        });
        const [{submissionId}, draft] = await Promise.all([
            opsApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: `${tag}au`,
                title: `Submission ${tag}s`,
            }),
            opsApi.createSubmission({
                tag: `${tag}d`,
                context: tag,
                submitter: `${tag}au`,
                title: `Submission ${tag}d`,
                submitted: false,
            }),
        ]);
        const funderName = `Fund ${tag}`;

        // A funder recorded while the server sits at its "ask" default —
        // the positive control for both surfaces and for the re-tick leg.
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await stubRegistrySearch(managerPage);
        let funding = await openFunding(managerPage, tag, submissionId);
        await funding.addFunder(funderName);

        const authorPage = await (await asUser(`${tag}au`)).newPage();
        await stubRegistrySearch(authorPage);
        const wizardFunders = authorPage.getByRole('table', {name: 'Funders', exact: true});

        // Untick "Enable funder metadata" on the Metadata settings screen.
        await managerPage.goto(`/index.php/${tag}/management/settings/workflow`);
        await managerPage.locator('#metadata-button').click();
        await managerPage.getByRole('checkbox', {name: 'Enable funder metadata'}).uncheck();
        await saveMetadataSettings(managerPage);

        // The workflow's Preprint area offers no "Funding" entry — bounded
        // by its sibling "Title & Abstract" entry rendering.
        await managerPage.goto(
            `/index.php/${tag}/dashboard/editorial?workflowSubmissionId=${submissionId}`
        );
        const noFunding = new FundingScreen(managerPage);
        await expect(
            managerPage.getByRole('link', {name: 'Title & Abstract', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(noFunding.fundingMenuLink()).toHaveCount(0);

        // The wizard's Details step carries no Funders section — bounded by
        // the step itself being current.
        await authorPage.goto(wizardUrl(tag, draft.submissionId));
        await expectWizardOpen(authorPage);
        await expectStep(authorPage, STEPS.files);
        await continueTo(authorPage, STEPS.details);
        await expect(wizardFunders).toHaveCount(0);

        // Re-tick and pick the "ask" level again (the earlier level is not
        // preselected — the open A8 stays unasserted; the radio is simply
        // picked).
        await managerPage.goto(`/index.php/${tag}/management/settings/workflow`);
        await managerPage.locator('#metadata-button').click();
        await managerPage.getByRole('checkbox', {name: 'Enable funder metadata'}).check();
        await managerPage
            .getByRole('radio', {name: 'Ask the author for funder metadata during submission.'})
            .check();
        await saveMetadataSettings(managerPage);

        // Both surfaces are back, the recorded funder intact.
        funding = await openFunding(managerPage, tag, submissionId);
        await expect(funding.row(funderName)).toBeVisible({timeout: 30_000});

        await authorPage.goto(wizardUrl(tag, draft.submissionId));
        await expectWizardOpen(authorPage);
        // The reloaded draft resumes at its saved step; walk forward to
        // Details when it isn't already current (a not-yet-started step has
        // no rail button to jump to).
        if (!(await currentRailStep(authorPage).textContent())?.includes('Details')) {
            await expectStep(authorPage, STEPS.files);
            await continueTo(authorPage, STEPS.details);
        }
        await expect(wizardFunders).toBeVisible({timeout: 30_000});
    });

    test('OPS1: the submitting author edits their unposted preprint\'s funders', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('o1', testInfo);
        // A submitted, not-yet-posted preprint by a roster author.
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });
        const funderName = `Fund ${tag}`;

        // OPS1 ✅ (Actors & permissions): on a preprint server the
        // submitting author's own workflow Funding list is fully editable
        // before posting — the inverse of the OJS/OMP read-only rule. The
        // author gets working Add Funder / Order buttons and the "…" row
        // menu, and an edit made through them persists.
        const authorPage = await (await asUser('author.alex')).newPage();
        await stubRegistrySearch(authorPage);
        let funding = await openFunding(authorPage, PK, submissionId, {author: true});

        await expect(funding.addFunderButton()).toBeEnabled();
        await funding.addFunder(funderName, {
            grants: [{grantName: `Grant ${tag}`, grantNumber: 'GN1111'}],
        });
        await expect(funding.orderButton()).toBeEnabled();
        await expect(funding.rowMoreActions(funderName)).toBeVisible();

        // The row's Edit opens the prefilled panel; the author's change
        // saves (bounded by the funders API) …
        await funding.openRowAction(funderName, 'Edit');
        const editPanel = funding.dialog('Edit Funder');
        await expect(editPanel).toBeVisible({timeout: 30_000});
        await expect(editPanel.locator('input[name="name"]').first()).toHaveValue(funderName);
        await editPanel.locator('input[name="grantNumber"]').fill('GN2222');
        await funding.savePanel(editPanel);

        // … and persists on a fresh load of the author's own view.
        funding = await openFunding(authorPage, PK, submissionId, {author: true});
        await funding.openRowAction(funderName, 'Edit');
        const reopened = funding.dialog('Edit Funder');
        await expect(reopened.locator('input[name="grantNumber"]')).toHaveValue('GN2222', {
            timeout: 30_000,
        });
    });
});
