// @ts-check
/**
 * @file playwright/tests/U41-contributors-and-affiliations.spec.js
 *
 * Contributors & affiliations — OPS suite, one test per canonical COMMON
 * scenario as a preprint server runs it (scenarios 1–8, in OPS vocabulary:
 * preprint server, preprint, the workflow's Publication-area nav group is
 * labeled "Preprint" and its pages are headed "Preprint: {entry}"; the
 * reader listing surface is the archive at /preprints) plus the spec's
 * OPS-specific scenario: OPS1 ✅ — the submitting author EDITS their own
 * not-yet-posted preprint's contributors (the app-intended variance; on
 * OJS/OMP the author's workflow list is read-only).
 * Spec: docs/specs/U41-contributors-and-affiliations.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - Scenario 3's delete-the-primary-contact leg and its publish-flow
 *   silence (A2 ❓ — deleting the primary contact silently leaves none):
 *   S3 stops at the clean Rule-10 contract (the badge moves at once);
 *   nothing is asserted about deleting the contact or the publish check.
 * - Scenario 4's / 6's registry-backed leg (a ROR-picked affiliation, its
 *   row's registry link, the reader page's ROR mark): on this install the
 *   server has no outbound internet, so a registry pick deterministically
 *   fails per A5 🐞 — and a 🐞 finding is never asserted as contract.
 *   Every affiliation here takes the typed-name path; A9 🐞 (the ROR
 *   link's missing accessible name) has no surface without it.
 * - Scenario 7's reader-listing leg: on a preprint server the listings
 *   showing the unticked contributor anyway is A3 🐞 — S7 asserts the
 *   clean side only (the Preview's "Publication Lists" row omits them,
 *   "Full" keeps them, the landing page still credits both); no OPS
 *   listing is asserted either way. "Abbreviated"'s indifference to the
 *   tick is likewise not asserted (the scenario unticks the second
 *   contributor, which "Abbreviated" never reads).
 * - A1 🐞 (contributor rows never show affiliations): nothing is asserted
 *   about the row's affiliation line either way.
 * - A4 ❓ (the organization "ROR ID" box takes anything): S1's
 *   organization contributor never touches the ROR ID box.
 * - A6 ❓ (read-only viewers cannot see the primary contact): no
 *   read-only badge assertion. Rule 9's read-only rendering itself has no
 *   OPS test: the spec scopes OPS1 to the not-yet-posted preprint and
 *   says nothing about the posted case (same boundary as the U43 OPS
 *   suite), and OPS's reduced roster offers no other workflow viewer
 *   without the edit permission; the read-only presentation is covered by
 *   the OJS/OMP suites.
 * - A7 🐞 ("[object Object]" in the affiliation error summary) and the
 *   primary-locale refusal that triggers it: not exercised.
 * - A8 ❓ (institution text typed but never picked is dropped): every
 *   typed institution here is picked and added; the drop is not asserted.
 * - A10 🐞 (the typed affiliation's name boxes announced wrongly): the
 *   per-language boxes are located positionally (`input[name="name"]`),
 *   never by label; nothing asserts their accessibility either way.
 * - A11 ❓ (a registry error kills the search until the panel reopens):
 *   the browser-side registry query is stubbed to an empty 200
 *   (FundingPages.stubRegistrySearch), so no error dialog can fire.
 * - A12 🐞 (the delete-role confirm button labeled with a sentence): S5
 *   locates that button permissively (current label OR a short "Delete")
 *   and asserts only its disabled-until-typed contract, never its label.
 * - A13 ❓ (a role name saves with a language empty): S5 runs on a
 *   single-language scratch server; the empty-language save is not
 *   exercised.
 * - A14 🐞 (a one-role journal cannot save contributors): no server is
 *   ever reduced to one role (S5 deletes only the role it added).
 * - S8 does not assert the Competing Interests field's LABEL: on OPS an
 *   app-level legacy locale override (`locale/en/author.po`
 *   `author.competingInterests`) renders as raw markup in the form —
 *   reported to the spec's Findings register; the field is asserted by
 *   its guidance sentence and editor instead.
 * - Rule 17 (contributors withheld from anonymized review): OPS ships no
 *   review machinery by design (spec baseline) — no OPS surface.
 * - The wizard's Contributors step (the shell is U21's; the panel it
 *   mounts is the same one exercised here) and the auto-created
 *   contributor's mechanics; the submitting author's panel access is
 *   OPS1's workflow-side test.
 * - ORCID field states (U04's), CRediT roles, Preferred Public Name and
 *   the Anonymous contributor type: not exercised.
 * - Side-effect silence ("no email, no notification, no activity-log
 *   entry"): a silence claim with no natural in-test positive control; no
 *   Mailpit use in this suite.
 * - OMP1/OMP2 ✅: OMP-only reader presentation — no OPS surface.
 *
 * Hermeticity: the Affiliations field queries the public ROR registry
 * from the BROWSER (from 4 typed characters); the suite stubs that query
 * to an empty result set (FundingPages.stubRegistrySearch — same
 * registry, same Autosuggest), so no test depends on api.ror.org and the
 * typed-text option under test renders independently of the suggestions
 * payload.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only at the server level — S1/S2/S3/S7/OPS1 mutate only their
 * own seeded submissions there; every settings or server-level mutation
 * (S4's second submission language, S5's roles, S6's clean archive,
 * S8's setting) runs on a scratch preprint server with throwaway users.
 * There is no contributor seeding key — the panel IS the surface under
 * test, so contributors beyond the auto-created submitter are always
 * recorded through it. Waits are event-based (contributors/publications/
 * contributorRoles API responses, web-first assertions) — no hard-coded
 * sleeps. Everything runs in the parallel `ops` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {ContributorsScreen} = require('../pages/ContributorPages.js');
const {stubRegistrySearch} = require('../pages/FundingPages.js');
const {openWorkflow, saveSettingsPanel} = require('../pages/PublicationPages.js');

const PK = 'publicknowledge';
const PK_PREFIX = '/en';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u41${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** Throwaway user spec for scratch contexts. */
function contextUsers(tag) {
    return [
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
    ];
}

/** Open a preprint's workflow and its Contributors screen. */
async function openContributors(page, contextPath, submissionId, options = {}) {
    await openWorkflow(page, contextPath, submissionId, options);
    const screen = new ContributorsScreen(page);
    await screen.openFromWorkflow();
    return screen;
}

/**
 * Pin a two-row contributor list's order so {firstName} leads, through the
 * screen's ordering mode: a panel-added second contributor TIES the
 * auto-created author at sequence 0, so the untouched display order is
 * nondeterministic until "Save Order" renumbers it.
 */
async function pinOrder(page, screen, firstName) {
    // Content-verified pin (campaign workaround; see the app-changes note):
    // the contributors screen can remount mid-flow on the async publication
    // refresh after a contributor save — dropping Order mode, swallowing
    // clicks, or resetting the client-side rows right before "Save Order"
    // serializes them, so the saveOrder POST can persist the OLD order
    // (response ok, content wrong; observed in the full-suite gate). Each
    // bounded attempt (re-)enters ordering, redoes the move, saves with a
    // freshly armed response wait, and passes only when the screen —
    // re-rendered from the response — shows the pinned order. Repeated
    // saveOrder POSTs are harmless (idempotent full-order persist).
    await expect(async () => {
        if (!(await screen.saveOrderButton().isVisible())) {
            await screen.orderButton().click({timeout: 2_000});
        }
        await page
            .getByRole('button', {name: `Increase position of ${firstName}`})
            .click({timeout: 2_000});
        await expect(screen.rows().first()).toContainText(firstName, {
            timeout: 2_000,
        });
        const saved = page.waitForResponse(
            (r) =>
                r.url().includes('/contributors/saveOrder') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 35_000}
        );
        saved.catch(() => {}); // consumed by the await below
        await screen.saveOrderButton().click({timeout: 2_000});
        await saved;
        // The success handler re-renders the rows from the response —
        // this verifies the PERSISTED order, not the client echo.
        await expect(screen.rows().first()).toContainText(firstName, {
            timeout: 5_000,
        });
    }).toPass({intervals: [1_000, 2_000], timeout: 120_000});
}

/** Open Settings › Workflow › Submission › Contributor Roles (Rule 12). */
async function openContributorRolesSettings(page, contextPath) {
    await page.goto(`/index.php/${contextPath}/management/settings/workflow`);
    await page.locator('#contributorRoles-button').click();
    const panel = page.locator('#contributorRoles');
    await expect(
        panel.getByRole('button', {name: 'Add Role', exact: true})
    ).toBeVisible({timeout: 30_000});
    return panel;
}

/** Open Settings › Workflow › Metadata and return its tab panel. */
async function openMetadataSettings(page, contextPath) {
    await page.goto(`/index.php/${contextPath}/management/settings/workflow`);
    await page.locator('#metadata-button').click();
    const panel = page.locator('#metadata');
    await expect(
        panel.getByRole('button', {name: 'Save', exact: true})
    ).toBeVisible({timeout: 30_000});
    return panel;
}

test.describe('Contributors & affiliations (U41)', () => {
    test('S1: maintain the contributor list', {tag: '@smoke'}, async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });
        const orgName = `Orga ${tag}`;

        const page = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(page);
        const screen = await openContributors(page, PK, submissionId);

        // The submitting author is already listed with an "Author" role
        // badge and the "Primary Contact" badge (Rules 3, 10, 11).
        await expect(screen.row('Alex Author')).toBeVisible();
        await expect(screen.roleBadge('Alex Author', 'Author')).toBeVisible();
        await expect(screen.primaryContactBadge('Alex Author')).toBeVisible();

        // "Add Contributor" opens the panel on Contributor Type = Person
        // (preselected radio; the two other choices offered); fill Given
        // Name, Email and Country, tick "Author", Save — the panel closes
        // and the new row shows the name with an "Author" badge (Rule 4).
        const addPanel = await screen.openAddPanel();
        await expect(
            addPanel.getByRole('radio', {name: 'Person', exact: true})
        ).toBeChecked();
        await expect(
            addPanel.getByRole('radio', {name: 'Organization or group', exact: true})
        ).toBeVisible();
        await expect(
            addPanel.getByRole('radio', {name: 'Anonymous', exact: true})
        ).toBeVisible();
        await screen.input('givenName', 'en').fill('Greta');
        await screen.input('email').fill(`${tag}g@mail.test`);
        await screen.input('country').selectOption({label: 'Canada'});
        await screen.roleCheckbox(addPanel, 'Author').check();
        await screen.saveForm(addPanel);
        await expect(screen.row('Greta')).toBeVisible({timeout: 30_000});
        await expect(screen.roleBadge('Greta', 'Author')).toBeVisible();

        // Add a second contributor as "Organization or group": the name
        // fields swap to "Organization Name" (Fields & validation).
        const orgPanel = await screen.openAddPanel();
        await orgPanel
            .getByRole('radio', {name: 'Organization or group', exact: true})
            .check();
        await expect(screen.input('organizationName', 'en')).toBeVisible();
        await expect(screen.input('givenName', 'en')).toHaveCount(0);
        await screen.input('organizationName', 'en').fill(orgName);
        await screen.input('email').fill(`${tag}o@mail.test`);
        await screen.input('country').selectOption({label: 'Canada'});
        await screen.roleCheckbox(orgPanel, 'Author').check();
        await screen.saveForm(orgPanel);
        await expect(screen.row(orgName)).toBeVisible({timeout: 30_000});

        // "Edit" opens the same panel prefilled; add a Family Name and
        // Save — the row updates in place (Rule 4).
        const editPanel = await screen.openEditPanel('Greta');
        await expect(screen.input('givenName', 'en')).toHaveValue('Greta');
        await screen.input('familyName', 'en').fill('Zeta');
        await screen.saveForm(editPanel);
        await expect(screen.row('Greta Zeta')).toBeVisible({timeout: 30_000});

        // "Delete" asks through the "Delete Contributor" dialog; Cancel
        // keeps the row, confirming removes it permanently (Rule 5).
        await screen.rowDeleteButton(orgName).click();
        const confirm = screen.deleteContributorDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await expect(confirm).toContainText(
            `Are you sure you want to remove ${orgName} as a contributor? This action can not be undone.`
        );
        await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(confirm).toHaveCount(0, {timeout: 30_000});
        await expect(screen.row(orgName)).toBeVisible();

        await screen.rowDeleteButton(orgName).click();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await screen.confirmDelete(orgName);
        await expect(screen.row('Greta Zeta')).toBeVisible();
    });

    test('S2: reorder and preview the display formats', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(page);
        const screen = await openContributors(page, PK, submissionId);

        // A second contributor with a distinct family name.
        await screen.addPersonContributor({
            given: 'Greta',
            family: 'Zeta',
            email: `${tag}g@mail.test`,
        });
        await expect(screen.row('Greta Zeta')).toBeVisible({timeout: 30_000});

        // Pin the starting order (Alex first): the panel-added second
        // contributor ties the auto-created author at sequence 0, so the
        // untouched order is nondeterministic (see pinOrder).
        await pinOrder(page, screen, 'Alex Author');

        // Preview (Rule 7): "Abbreviated" is the first contributor's
        // family name plus "et al."; "Full" is both names each followed
        // by "(Author)", semicolon-separated.
        let preview = await screen.openPreview();
        await expect(preview).toContainText(
            'Contributors to this publication will be identified in the following formats.'
        );
        await expect(screen.previewRow('Abbreviated')).toContainText('Author et al.');
        await expect(screen.previewRow('Full')).toContainText(
            'Alex Author (Author); Greta Zeta (Author)'
        );
        await screen.closePreview();

        // Ordering (Rule 6): "Order" swaps the header buttons for
        // "Save Order"/"Cancel" and gives each row named up/down arrows.
        await screen.orderButton().click();
        await expect(screen.saveOrderButton()).toBeVisible();
        await expect(screen.cancelOrderButton()).toBeVisible();
        await expect(screen.addContributorButton()).toHaveCount(0);
        await expect(screen.previewButton()).toHaveCount(0);
        // Content-verified reorder (see pinOrder): each bounded attempt
        // (re-)enters ordering, redoes the move, saves with a freshly armed
        // response wait, and passes only when the screen — re-rendered from
        // the response — shows the new order (the remount race can
        // otherwise persist the OLD order: response ok, content wrong).
        await expect(async () => {
            if (!(await screen.saveOrderButton().isVisible())) {
                await screen.orderButton().click({timeout: 2_000});
            }
            await screen.moveUpButton('Greta Zeta').click({timeout: 2_000});
            await expect(screen.rows().first()).toContainText('Greta Zeta', {
                timeout: 2_000,
            });
            const orderSaved = page.waitForResponse(
                (r) =>
                    r.url().includes('/contributors/saveOrder') &&
                    r.request().method() === 'POST' &&
                    r.ok(),
                {timeout: 35_000}
            );
            orderSaved.catch(() => {}); // consumed by the await below
            await screen.saveOrderButton().click({timeout: 2_000});
            await orderSaved;
            // The success handler re-renders the rows from the response —
            // this verifies the PERSISTED order, not the client echo.
            await expect(screen.rows().first()).toContainText('Greta Zeta', {
                timeout: 5_000,
            });
        }).toPass({intervals: [1_000, 2_000], timeout: 120_000});

        // Reload: the order holds, and "Abbreviated" now names the other
        // family name.
        const reloaded = await openContributors(page, PK, submissionId);
        await expect(reloaded.rows().first()).toContainText('Greta Zeta', {
            timeout: 30_000,
        });
        await expect(reloaded.rows().nth(1)).toContainText('Alex Author');
        preview = await reloaded.openPreview();
        await expect(reloaded.previewRow('Abbreviated')).toContainText('Zeta et al.');
        await reloaded.closePreview();

        // "Order" again, move a row, "Cancel" — the saved order is back.
        await reloaded.orderButton().click();
        await reloaded.moveUpButton('Alex Author').click();
        await expect(reloaded.rows().first()).toContainText('Alex Author');
        await reloaded.cancelOrderButton().click();
        await expect(reloaded.rows().first()).toContainText('Greta Zeta', {
            timeout: 30_000,
        });
        await expect(reloaded.rows().nth(1)).toContainText('Alex Author');
    });

    test('S3: move the primary contact', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(page);
        const screen = await openContributors(page, PK, submissionId);
        await screen.addPersonContributor({
            given: 'Greta',
            family: 'Zeta',
            email: `${tag}g@mail.test`,
        });

        // The submitting author's row carries "Primary Contact" while the
        // other row offers "Set Primary Contact" (Rule 10).
        await expect(screen.primaryContactBadge('Alex Author')).toBeVisible({
            timeout: 30_000,
        });
        await expect(screen.setPrimaryContactButton('Greta Zeta')).toBeVisible();

        // Pressing it moves the badge at once, with no confirmation step —
        // bounded by the publication PUT the panel sends.
        await screen.setPrimaryContact('Greta Zeta');
        await expect(screen.primaryContactBadge('Greta Zeta')).toBeVisible({
            timeout: 30_000,
        });
        await expect(screen.primaryContactBadge('Alex Author')).toHaveCount(0);
        await expect(screen.setPrimaryContactButton('Alex Author')).toBeVisible();

        // The move persists on a fresh load. (Deleting the new primary
        // contact is A2's open question — not exercised.)
        const reloaded = await openContributors(page, PK, submissionId);
        await expect(reloaded.primaryContactBadge('Greta Zeta')).toBeVisible({
            timeout: 30_000,
        });
        await expect(reloaded.setPrimaryContactButton('Alex Author')).toBeVisible();
    });

    test('S4: record typed affiliations, with per-language names', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        // The multilingual leg needs a second submission language —
        // scratch server (publicknowledge is read-only at that level).
        await opsApi.createContext({
            tag,
            context: {
                supportedLocales: ['en', 'fr_CA'],
                supportedSubmissionLocales: ['en', 'fr_CA'],
            },
            users: contextUsers(tag),
        });
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
        });
        const instA = `AlphaUni${tag}`;
        const instAFr = `AlphaUniFr${tag}`;
        const instB = `BetaUni${tag}`;

        const page = await (await asUser(`${tag}mg`)).newPage();
        await stubRegistrySearch(page);
        const screen = await openContributors(page, tag, submissionId);

        // Under "Affiliations", type a made-up institution, pick the
        // typed text itself from the suggestions and press "Add" (Fields
        // & validation; the registry-backed leg is not run here — see the
        // file header).
        let panel = await screen.openEditPanel('Ada Author');
        await expect(
            panel.getByText('Enter the full name of the institution below', {
                exact: false,
            })
        ).toBeVisible();
        // The seeded contributor arrives without a Country; the required
        // field must be completed before any save of this record.
        await screen.input('country').selectOption({label: 'Canada'});
        await screen.addTypedAffiliation(panel, instA);

        // The typed entry carries a completeness status and, behind its
        // "…" menu, "Edit institution name" with one name box per
        // submission language (the boxes are located positionally — their
        // announced labels are A10's territory, not asserted).
        const rowA = screen.affiliationRow(panel, instA);
        await expect(rowA.getByText('1 of 2 languages completed')).toBeVisible();
        await screen.openAffiliationRowAction(panel, instA, 'Edit institution name');
        const nameBoxes = rowA.locator('input[name="name"]');
        await expect(nameBoxes).toHaveCount(2, {timeout: 10_000});
        await expect(nameBoxes.nth(0)).toHaveValue(instA);
        await nameBoxes.nth(1).fill(instAFr);
        await nameBoxes.nth(1).press('Tab');
        await expect(rowA.getByText('All translations available')).toBeVisible({
            timeout: 10_000,
        });

        // A second typed institution, then save the contributor.
        await screen.addTypedAffiliation(panel, instB);
        await screen.saveForm(panel);

        // Reopen Edit — both institutions are there, with their statuses.
        panel = await screen.openEditPanel('Ada Author');
        await expect(screen.affiliationRow(panel, instA)).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            screen.affiliationRow(panel, instA).getByText('All translations available')
        ).toBeVisible();
        await expect(screen.affiliationRow(panel, instB)).toBeVisible();
        await expect(
            screen
                .affiliationRow(panel, instB)
                .getByText('1 of 2 languages completed')
        ).toBeVisible();

        // Remove one: "Are you sure?" — "The affiliation {name} will be
        // deleted."; "Yes" removes it; the removal persists on save.
        await screen.openAffiliationRowAction(panel, instB, 'Remove institution');
        const confirm = screen.affiliationDeleteDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await expect(confirm).toContainText('Are you sure?');
        await expect(confirm).toContainText(
            `The affiliation ${instB} will be deleted.`
        );
        await confirm.getByRole('button', {name: 'Yes', exact: true}).click();
        await expect(screen.affiliationRow(panel, instB)).toHaveCount(0, {
            timeout: 10_000,
        });
        await screen.saveForm(panel);

        panel = await screen.openEditPanel('Ada Author');
        await expect(screen.affiliationRow(panel, instA)).toBeVisible({
            timeout: 30_000,
        });
        await expect(screen.affiliationRow(panel, instB)).toHaveCount(0);
    });

    test('S5: manage the server\'s contributor roles', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        // Roles are server records (Rule 11) — scratch server, with one
        // submission whose contributor will hold the new role.
        await opsApi.createContext({tag, users: contextUsers(tag)});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
        });
        const roleName = `Handling Editor ${tag}`;

        const page = await (await asUser(`${tag}mg`)).newPage();
        await stubRegistrySearch(page);

        // The table lists the preprint server's starting pair (Rule 11).
        let settings = await openContributorRolesSettings(page, tag);
        const authorRow = settings.locator('tr').filter({hasText: 'AUTHOR'}).first();
        await expect(authorRow).toContainText('Author');
        await expect(
            settings.locator('tr').filter({hasText: 'TRANSLATOR'})
        ).toContainText('Translator');

        // "Add Role": pick identifier EDITOR, name it ("Fill name in all
        // of the languages."), Save — "Contributor role saved" and the
        // row appears (Rules 12, scenario 5).
        await settings.getByRole('button', {name: 'Add Role', exact: true}).click();
        const addRole = page.getByRole('dialog', {name: 'Add Role'});
        await expect(addRole).toBeVisible({timeout: 30_000});
        await expect(
            addRole.getByText('Fill name in all of the languages.')
        ).toBeVisible();
        await page
            .locator('#editContributorRole-contributorRoleIdentifier-control')
            .selectOption('EDITOR');
        await page.locator('#editContributorRole-name-control-en').fill(roleName);
        const roleSaved = page.waitForResponse(
            (r) =>
                r.url().includes('/contributorRoles') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await addRole.getByRole('button', {name: 'Save', exact: true}).click();
        await roleSaved;
        await expect(page.getByText('Contributor role saved')).toBeVisible({
            timeout: 30_000,
        });
        const newRoleRow = settings.locator('tr').filter({hasText: roleName});
        await expect(newRoleRow).toBeVisible({timeout: 30_000});
        await expect(newRoleRow).toContainText('EDITOR');

        // On the submission, tick the new role on a contributor — its
        // badge joins the row.
        const screen = await openContributors(page, tag, submissionId);
        let panel = await screen.openEditPanel('Ada Author');
        // The seeded contributor arrives without a Country; complete the
        // required field so the save under test is the role change.
        await screen.input('country').selectOption({label: 'Canada'});
        await screen.roleCheckbox(panel, roleName).check();
        await screen.saveForm(panel);
        await expect(screen.roleBadge('Ada Author', roleName)).toBeVisible({
            timeout: 30_000,
        });

        // "Delete Role" opens the type-to-confirm dialog; with the role
        // in use the delete is refused in a modal "Error" dialog
        // (Rule 13). The confirm button is matched permissively — its
        // sentence label is A12, never asserted.
        settings = await openContributorRolesSettings(page, tag);
        const confirmButtonName = /Are you sure you wish to delete this item|^Delete$/;
        await newRoleRow.getByRole('button', {name: 'More Actions'}).click();
        await page.getByRole('menuitem', {name: 'Delete Role', exact: true}).click();
        let confirmDialog = page
            .getByRole('dialog')
            .filter({hasText: 'Are you absolutely sure you want to delete "EDITOR" role?'});
        await expect(confirmDialog).toBeVisible({timeout: 30_000});
        let confirmButton = confirmDialog.getByRole('button', {
            name: confirmButtonName,
        });
        // The confirm enables only on an exact identifier match (Rule 13).
        await expect(confirmButton).toBeDisabled();
        await confirmDialog.locator('input').fill('EDIT');
        await expect(confirmButton).toBeDisabled();
        await confirmDialog.locator('input').fill('EDITOR');
        await expect(confirmButton).toBeEnabled();
        const inUseAttempt = page.waitForResponse(
            (r) =>
                r.url().includes('/contributorRoles/') &&
                r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await confirmButton.click();
        await inUseAttempt;
        const inUseError = page
            .getByRole('dialog')
            .filter({hasText: 'One or more contributors are using this role'});
        await expect(inUseError).toBeVisible({timeout: 30_000});
        await expect(inUseError).toContainText(
            'One or more contributors are using this role. Change the role to another before delete.'
        );
        await inUseError.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(inUseError).toHaveCount(0, {timeout: 30_000});
        await expect(newRoleRow).toBeVisible();

        // Untick the role on the contributor, then delete it for real:
        // "Role Deleted" confirms.
        const screen2 = await openContributors(page, tag, submissionId);
        panel = await screen2.openEditPanel('Ada Author');
        await screen2.roleCheckbox(panel, roleName).uncheck();
        await screen2.saveForm(panel);
        await expect(screen2.roleBadge('Ada Author', roleName)).toHaveCount(0, {
            timeout: 30_000,
        });

        settings = await openContributorRolesSettings(page, tag);
        await settings
            .locator('tr')
            .filter({hasText: roleName})
            .getByRole('button', {name: 'More Actions'})
            .click();
        await page.getByRole('menuitem', {name: 'Delete Role', exact: true}).click();
        confirmDialog = page
            .getByRole('dialog')
            .filter({hasText: 'Are you absolutely sure you want to delete "EDITOR" role?'});
        await expect(confirmDialog).toBeVisible({timeout: 30_000});
        confirmButton = confirmDialog.getByRole('button', {name: confirmButtonName});
        await confirmDialog.locator('input').fill('EDITOR');
        const deleted = page.waitForResponse(
            (r) =>
                r.url().includes('/contributorRoles/') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await confirmButton.click();
        await deleted;
        const deletedDialog = page
            .getByRole('dialog')
            .filter({hasText: 'has been successfully deleted'});
        await expect(deletedDialog).toBeVisible({timeout: 30_000});
        await expect(deletedDialog).toContainText('Role Deleted');
        await deletedDialog
            .getByRole('button', {name: 'Back to Contributor Roles', exact: true})
            .click();
        await expect(settings.locator('tr').filter({hasText: roleName})).toHaveCount(
            0,
            {timeout: 30_000}
        );

        // "Delete Role" on "Author" while the seeded contributor still
        // holds it: BOTH preconditions would refuse, and the in-use
        // refusal is the one shown (Rule 13's precedence).
        const attemptAuthorDelete = async () => {
            await authorRow.getByRole('button', {name: 'More Actions'}).click();
            await page
                .getByRole('menuitem', {name: 'Delete Role', exact: true})
                .click();
            const dialog = page.getByRole('dialog').filter({
                hasText: 'Are you absolutely sure you want to delete "AUTHOR" role?',
            });
            await expect(dialog).toBeVisible({timeout: 30_000});
            await dialog.locator('input').fill('AUTHOR');
            const attempt = page.waitForResponse(
                (r) =>
                    r.url().includes('/contributorRoles/') &&
                    r.request().method() === 'POST',
                {timeout: 30_000}
            );
            await dialog.getByRole('button', {name: confirmButtonName}).click();
            await attempt;
        };
        await attemptAuthorDelete();
        const bothApplyError = page
            .getByRole('dialog')
            .filter({hasText: 'One or more contributors are using this role'});
        await expect(bothApplyError).toBeVisible({timeout: 30_000});
        await bothApplyError.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(bothApplyError).toHaveCount(0, {timeout: 30_000});

        // Free the role (the contributor keeps "Translator"), then the
        // server's last AUTHOR-identifier role still can never be deleted
        // (Rule 13) — refused in the same "Error" dialog shape.
        const screen3 = await openContributors(page, tag, submissionId);
        panel = await screen3.openEditPanel('Ada Author');
        await screen3.roleCheckbox(panel, 'Translator').check();
        await screen3.roleCheckbox(panel, 'Author').uncheck();
        await screen3.saveForm(panel);
        await expect(screen3.roleBadge('Ada Author', 'Translator')).toBeVisible({
            timeout: 30_000,
        });

        settings = await openContributorRolesSettings(page, tag);
        await attemptAuthorDelete();
        const authorError = page
            .getByRole('dialog')
            .filter({hasText: 'Last AUTHOR role cannot be deleted.'});
        await expect(authorError).toBeVisible({timeout: 30_000});
        await authorError.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(settings.locator('tr').filter({hasText: 'AUTHOR'}).first()).toBeVisible();
    });

    test('S6: readers see the contributors', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const title = `Submission ${tag}`;
        // Scratch server: the archive listing then holds only this
        // preprint (publicknowledge's archive accumulates parallel
        // residue).
        await opsApi.createContext({tag, users: contextUsers(tag)});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title,
            published: true,
        });
        const instName = `AlphaUni${tag}`;
        const bioText = `Ada studies preprints ${tag}.`;

        // The manager gives the first contributor a typed affiliation, a
        // Bio Statement and a second role, and adds a second contributor.
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await stubRegistrySearch(managerPage);
        const screen = await openContributors(managerPage, tag, submissionId);
        let panel = await screen.openEditPanel('Ada Author');
        // The seeded contributor arrives without a Country (required).
        await screen.input('country').selectOption({label: 'Canada'});
        await screen.addTypedAffiliation(panel, instName);
        await screen.fillRichText('biography', 'en', bioText);
        await screen.roleCheckbox(panel, 'Translator').check();
        await screen.saveForm(panel);
        await screen.addPersonContributor({
            given: 'Greta',
            family: 'Zeta',
            email: `${tag}g@mail.test`,
        });
        await expect(screen.row('Greta Zeta')).toBeVisible({timeout: 30_000});

        // The landing page credits both in list order: names, the
        // affiliation name and the role names (Rule 14).
        await page.goto(`/index.php/${tag}/preprint/view/${submissionId}`);
        const authorItems = page.locator('.item.authors li');
        await expect(authorItems.first()).toContainText('Ada Author', {
            timeout: 30_000,
        });
        await expect(authorItems.first().locator('.affiliation')).toContainText(
            instName
        );
        await expect(
            authorItems.first().locator('.contributor_roles')
        ).toContainText('Author');
        await expect(
            authorItems.first().locator('.contributor_roles')
        ).toContainText('Translator');
        await expect(authorItems.nth(1)).toContainText('Greta Zeta');
        await expect(authorItems.nth(1).locator('.contributor_roles')).toContainText(
            'Author'
        );

        // The "Author Biography" section: "{name}, {affiliations}" above
        // the statement (Rule 14 — one biography, singular heading).
        const bios = page.locator('.item.author_bios');
        await expect(bios.getByRole('heading', {name: 'Author Biography'})).toBeVisible();
        await expect(bios.locator('div.label')).toContainText('Ada Author,');
        await expect(bios.locator('div.label')).toContainText(instName);
        await expect(bios).toContainText(bioText);

        // The archive listing shows the author line in the "Full" format
        // — names with roles in parentheses (Rule 15; role order inside
        // the parentheses is not part of the assertion).
        await page.goto(`/index.php/${tag}/preprints`);
        const summary = page.locator('.obj_preprint_summary').filter({hasText: title});
        await expect(summary).toBeVisible({timeout: 30_000});
        const authorLine = summary.locator('.authors');
        await expect(authorLine).toContainText('Ada Author (');
        await expect(authorLine).toContainText('Translator');
        await expect(authorLine).toContainText('Greta Zeta (Author)');
    });

    test('S7: keep a contributor out of publication lists', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            published: true,
        });

        const managerPage = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(managerPage);
        const screen = await openContributors(managerPage, PK, submissionId);
        await screen.addPersonContributor({
            given: 'Greta',
            family: 'Zeta',
            email: `${tag}g@mail.test`,
        });
        await expect(screen.row('Greta Zeta')).toBeVisible({timeout: 30_000});

        // Untick "Publication Lists" on the second contributor (the
        // checkbox arrives ticked by default — Fields & validation).
        const panel = await screen.openEditPanel('Greta Zeta');
        const tick = screen.includeInBrowseCheckbox(panel);
        await expect(tick).toBeChecked();
        await tick.uncheck();
        await screen.saveForm(panel);

        // Preview now omits them from the "Publication Lists" row while
        // "Full" keeps them (Rule 8's clean side; the OPS reader-listing
        // behavior is A3 — not asserted either way).
        await screen.openPreview();
        const listsRow = screen.previewRow('Publication Lists');
        await expect(listsRow).toContainText('Alex Author');
        await expect(listsRow).not.toContainText('Greta Zeta');
        // Order-agnostic: the untouched two-row list ties at sequence 0
        // (see pinOrder), so which name leads is nondeterministic — S7's
        // rule is presence in the formats, not order.
        const fullRow = screen.previewRow('Full');
        await expect(fullRow).toContainText('Alex Author (Author)');
        await expect(fullRow).toContainText('Greta Zeta (Author)');
        await screen.closePreview();

        // The landing page still credits both (Rules 8, 14).
        await page.goto(
            `/index.php/${PK}${PK_PREFIX}/preprint/view/${submissionId}`
        );
        const authorItems = page.locator('.item.authors li');
        await expect(authorItems.filter({hasText: 'Alex Author'})).toBeVisible({
            timeout: 30_000,
        });
        await expect(authorItems.filter({hasText: 'Greta Zeta'})).toBeVisible();
    });

    test('S8: require competing interests', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        // The setting is mutated — scratch server.
        await opsApi.createContext({tag, users: contextUsers(tag)});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
        });
        const ciText = `No competing interests ${tag}.`;

        const page = await (await asUser(`${tag}mg`)).newPage();
        await stubRegistrySearch(page);

        // Tick the requirement on the workflow settings' Metadata screen
        // (Settings that modify behavior).
        let settings = await openMetadataSettings(page, tag);
        await settings
            .getByRole('checkbox', {
                name: /Require submitting Authors to file a Competing Interest/,
            })
            .check();
        await saveSettingsPanel(page, settings);

        // Editing any contributor now shows the required "Competing
        // Interests" field; saving it empty is refused on the form.
        const screen = await openContributors(page, tag, submissionId);
        let panel = await screen.openEditPanel('Ada Author');
        // The field is asserted by its guidance sentence and its editor —
        // not its label: on OPS the label renders an app-level legacy
        // locale override as raw markup (reported to the register; the
        // spec's "Competing Interests" label is OJS/OMP-verified only).
        await expect(
            panel.getByText(
                'Please disclose any competing interests this author may have with the research subject.'
            )
        ).toBeVisible();
        await expect(
            page.locator(`iframe#${screen.controlId('competingInterests', 'en')}_ifr`)
        ).toBeVisible();
        // The seeded contributor arrives without a Country; complete the
        // required field first so the refusal under test is the empty
        // statement alone ("Please correct one error." — singular).
        await screen.input('country').selectOption({label: 'Canada'});
        await panel.getByRole('button', {name: 'Save', exact: true}).click();
        await expect(panel.getByText('Please correct one error.')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            panel.getByText('This field is required.').first()
        ).toBeVisible();

        // Filling it saves.
        await screen.fillRichText('competingInterests', 'en', ciText);
        await screen.saveForm(panel);

        // Untick the setting: the field is gone from the form (positive
        // control: the Bio Statement field still renders).
        settings = await openMetadataSettings(page, tag);
        await settings
            .getByRole('checkbox', {
                name: /Require submitting Authors to file a Competing Interest/,
            })
            .uncheck();
        await saveSettingsPanel(page, settings);

        const screen2 = await openContributors(page, tag, submissionId);
        panel = await screen2.openEditPanel('Ada Author');
        await expect(
            panel.getByText('Bio Statement (e.g., department and rank)', {
                exact: true,
            })
        ).toBeVisible();
        await expect(
            page.locator(`iframe#${screen2.controlId('competingInterests', 'en')}_ifr`)
        ).toHaveCount(0);
    });

    test('OPS1: the submitting author edits their unposted preprint\'s contributors', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('o1', testInfo);
        // A submitted, not-yet-posted preprint by a roster author.
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        // OPS1 ✅ (Actors & permissions): the submitting author's own
        // workflow Contributors list is fully editable before posting —
        // the inverse of the OJS/OMP read-only rule. The author gets
        // working "Add Contributor" and "Order" buttons and the full row
        // actions, and an edit made through them persists. (The posted
        // case is outside OPS1's scope — see the file header.)
        const authorPage = await (await asUser('author.alex')).newPage();
        await stubRegistrySearch(authorPage);
        let screen = await openContributors(authorPage, PK, submissionId, {
            author: true,
        });

        await expect(screen.addContributorButton()).toBeEnabled();
        await expect(screen.orderButton()).toBeEnabled();
        await expect(screen.rowEditButton('Alex Author')).toBeVisible();
        await expect(screen.rowDeleteButton('Alex Author')).toBeVisible();

        await screen.addPersonContributor({
            given: 'Greta',
            family: 'Zeta',
            email: `${tag}g@mail.test`,
        });
        await expect(screen.row('Greta Zeta')).toBeVisible({timeout: 30_000});
        await expect(screen.setPrimaryContactButton('Greta Zeta')).toBeVisible();

        // The author's edit saves and persists on a fresh load of their
        // own view.
        const panel = await screen.openEditPanel('Greta Zeta');
        await screen.input('familyName', 'en').fill('Nova');
        await screen.saveForm(panel);
        await expect(screen.row('Greta Nova')).toBeVisible({timeout: 30_000});

        screen = await openContributors(authorPage, PK, submissionId, {
            author: true,
        });
        await expect(screen.row('Greta Nova')).toBeVisible({timeout: 30_000});
        await expect(screen.rowEditButton('Greta Nova')).toBeVisible();
    });
});
