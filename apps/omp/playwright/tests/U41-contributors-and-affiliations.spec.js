// @ts-check
/**
 * @file playwright/tests/U41-contributors-and-affiliations.spec.js
 *
 * Contributors & affiliations — OMP suite: one test per canonical COMMON
 * scenario as a press runs it (spec scenarios 1–8, in OMP vocabulary:
 * press, monograph, catalog book page, catalog listing) plus the
 * OMP-specific entries: the FOUR seeded press contributor roles ride
 * inside S5 (Rule 11 — Author, Translator, Chapter Author, Volume editor,
 * with the press-flavored last-AUTHOR leg), OMP1 ✅ (a book with five or
 * more contributors compacts to one names-only line), OMP2 ✅ (an Edited
 * Volume's book page credits its volume editors "(ed)"), and the press
 * side of Rule 9 (the author's workflow list is read-only with the
 * controls absent entirely — the counterpart of the spec's OPS1).
 * S7 asserts the press's own HONORED publication-lists tick — the catalog
 * listing is the one reader listing that applies it (the spec rule's clean
 * side; A3 🐞 is the journal/preprint-server side).
 * Spec: docs/specs/U41-contributors-and-affiliations.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - The registry-backed affiliation leg of scenario 4 (a pick fixed to its
 *   ROR record, the row's registry link, the reader page's ROR mark): on
 *   this install the server has no outbound internet, so every registry
 *   pick deterministically fails per A5 🐞 — and a 🐞 finding is never
 *   asserted as contract. Every affiliation here takes the typed-name
 *   path; the browser-side registry query is stubbed to an empty result
 *   set (ContributorPages.stubRegistrySearch) so no test depends on
 *   api.ror.org. Registry errors are never simulated, so A11 ❓ (the
 *   search staying dead after an error dialog) is untouched.
 * - A2 ❓ (deleting the primary contact silently leaves none): S3 stops at
 *   the clean badge move; the delete-the-contact leg and the publish
 *   flow's silence about it are not exercised either way.
 * - A1 🐞 (rows never show affiliations): nothing asserts the row's
 *   affiliation line either way, and OMP1's five contributors are seeded
 *   WITHOUT affiliations so the compacted line's dangling-comma symptom
 *   never renders.
 * - A14 🐞 (a one-role journal cannot save contributors): no press here is
 *   ever reduced to one role.
 * - A7 🐞 (the error summary's "[object Object]"): S4 asserts the correct
 *   INLINE refusal message only, never the foot summary's affiliation line.
 * - A12 🐞 (the delete-role confirm button labeled with a whole sentence):
 *   S5 reaches the button by a /delete/i name match that survives a fix to
 *   a short "Delete" label; the (broken) label is never asserted.
 * - A9/A10 🐞 (accessibility names of the reader page's ROR link and the
 *   typed-name boxes): the boxes are located structurally, not by their
 *   (broken) accessible names; nothing asserts either finding.
 * - A4 ❓ (the organization "ROR ID" box takes anything), A6 ❓ (the
 *   read-only list hiding the Primary Contact badge — the author-view test
 *   asserts the CONTROLS absent, the badge not either way), A8 ❓ (typed
 *   but never picked institution text silently dropped), A13 ❓ (a role
 *   name saving with a language left empty — S5's scratch press is
 *   single-language) are open questions, not coverage gaps.
 * - Rule 17 (contributors withheld from anonymized review): observable
 *   only in the reviewer's payload, with no screen surface to assert —
 *   left to the spec's payload evidence.
 * - Side-effect silence ("no email, no notification, no activity-log
 *   entry"): a silence claim with no natural in-test positive control; not
 *   asserted (no Mailpit use in this suite).
 * - The wizard's Contributors step (the shell is U21's; the panel is the
 *   same component asserted here), versioning's contributor copy (Rule 1 —
 *   *Publish, schedule & versions*), the ORCID field's states (U04), and
 *   the change-language name copy (U40's flow, touched by its OMP S6).
 * - Rule 6's "a contributor added later joins at the end" (and the
 *   stability of a never-reordered list) is not asserted as such: tests
 *   that depend on who is first pin the order through the screen's own
 *   ordering mode before asserting, so the ordering assertions hold by
 *   construction and do not depend on insertion order. The pin is for
 *   determinism only (A15, the former sequence tie, is retired).
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only (role and settings mutations run on scratch presses with
 * throwaway users; publicknowledge tests only add their own tagged
 * submissions and contributors, per PRINCIPLES A1). There is no
 * contributor seeding key — the add/edit panel IS the surface under test,
 * so contributors beyond the auto-created submitter are always recorded
 * through it. Waits are event-based (contributors/publication API
 * responses, web-first assertions) — no hard-coded sleeps. Everything
 * runs in the parallel `omp` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    ContributorsScreen,
    stubRegistrySearch,
} = require('../pages/ContributorPages.js');

const PK = 'publicknowledge';
const PK_PREFIX = '/en';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u41${scenario}ompw${testInfo.parallelIndex}${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}

/**
 * Open a monograph's workflow view (editorial or author dashboard), then
 * its Contributors screen.
 */
async function openContributors(page, contextPath, submissionId, {author = false} = {}) {
    const dashboard = author ? 'mySubmissions' : 'editorial';
    await page.goto(
        `/index.php/${contextPath}/dashboard/${dashboard}?workflowSubmissionId=${submissionId}`
    );
    const screen = new ContributorsScreen(page);
    await screen.openFromWorkflow();
    return screen;
}

/** The catalog book page URL (publicknowledge is bilingual → /en prefix). */
function bookUrl(contextPath, submissionId) {
    const prefix = contextPath === PK ? PK_PREFIX : '';
    return `/index.php/${contextPath}${prefix}/catalog/book/${submissionId}`;
}

/** The catalog listing URL (scratch presses are single-locale → bare). */
function catalogUrl(contextPath) {
    return `/index.php/${contextPath}/catalog`;
}

/** A scratch press with a manager and an author (U40/U43 shape). */
function scratchPressSpec(tag, {locales} = {}) {
    return {
        tag,
        ...(locales
            ? {
                  context: {
                      supportedLocales: locales,
                      supportedSubmissionLocales: locales,
                  },
              }
            : {}),
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
    };
}

/**
 * Pin a two-row contributor list's order so {firstName} leads, through the
 * screen's own ordering mode. For determinism: "Save Order" persists an
 * explicit sequence for every row, so the callers' ordering assertions
 * hold by construction instead of depending on insertion order (see the
 * file header).
 */
async function pinOrder(page, screen, firstName) {
    // Content-verified pin (campaign workaround; see the app-changes note):
    // the contributors screen can remount mid-flow on the async publication
    // refresh after a contributor save — dropping Order mode, swallowing
    // clicks, or resetting the client-side rows right before "Save Order"
    // serializes them, so the saveOrder POST can persist the OLD order
    // (response ok, content wrong). Each bounded attempt (re-)enters
    // ordering, redoes the move, saves with a freshly armed response wait,
    // and passes only when the screen — re-rendered from the response —
    // shows the pinned order. Repeated saveOrder POSTs are harmless
    // (idempotent full-order persist).
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

/** Open Settings › Workflow › Submission › Contributor Roles. */
async function openContributorRolesSettings(page, contextPath) {
    await page.goto(`/index.php/${contextPath}/management/settings/workflow`);
    await page.locator('#contributorRoles-button').click();
    await expect(rolesTable(page)).toBeVisible({timeout: 30_000});
}

/** The Contributor Roles settings table. */
function rolesTable(page) {
    return page.getByRole('table', {name: 'Contributor Roles'});
}

/** A role's row, matched by its exact Role Name header cell. */
function roleRow(page, name) {
    return rolesTable(page)
        .getByRole('row')
        .filter({has: page.getByRole('rowheader', {name, exact: true})});
}

/**
 * Open a role row's "…" menu action ("Edit" / "Delete Role"); the menu
 * portals to the document root.
 */
async function openRoleRowAction(page, name, action) {
    await roleRow(page, name).getByRole('button', {name: 'More Actions'}).click();
    await page.getByRole('menuitem', {name: action, exact: true}).click();
}

/** The delete-role type-to-confirm dialog. */
function typeToConfirmDialog(page) {
    return page.getByRole('dialog').filter({hasText: 'Are you absolutely sure'});
}

/**
 * The type-to-confirm dialog's confirm button. Located by a /delete/i name
 * match so the (mislabeled — spec A12, never asserted) button is still
 * found after a fix to a short "Delete" label; "Cancel" and "Close" never
 * match.
 */
function confirmDeleteButton(dialog) {
    return dialog.getByRole('button', {name: /delete/i});
}

/** Open Settings › Workflow › Metadata on a scratch press (U40 shape). */
async function openMetadataSettings(page, contextPath) {
    await page.goto(`/index.php/${contextPath}/management/settings/workflow`);
    await page.locator('#metadata-button').click();
    await expect(
        page.getByRole('checkbox', {name: 'Enable keyword metadata'})
    ).toBeVisible({timeout: 30_000});
}

/** The metadata settings form (scoped by a checkbox it always carries). */
function metadataSettingsForm(page) {
    return page
        .locator('form')
        .filter({has: page.getByRole('checkbox', {name: 'Enable keyword metadata'})});
}

/** Save a settings form, bounded by the contexts API answering OK. */
async function saveSettingsForm(page, form) {
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

test.describe('Contributors & affiliations (U41)', () => {
    test('S1: maintain the contributor list', {tag: '@smoke'}, async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });
        const orgName = `Org ${tag}`;

        const page = await (await asUser('manager.maya')).newPage();
        const screen = await openContributors(page, PK, submissionId);

        // The submitting author is already listed with an "Author" role
        // badge and the "Primary Contact" badge (Rules 2–3, 10–11).
        await expect(screen.row('Alex Author')).toBeVisible();
        await expect(screen.roleBadge('Alex Author', 'Author')).toBeVisible();
        await expect(screen.primaryContactBadge('Alex Author')).toBeVisible();

        // "Add Contributor" opens the panel on Contributor Type = Person,
        // with the type guidance (Fields & validation).
        let dialog = await screen.openAdd();
        await expect(dialog.getByRole('radio', {name: 'Person', exact: true})).toBeChecked();
        await expect(
            dialog.getByText('Selecting a contributor type will determine which fields')
        ).toBeVisible();

        // Switching the type swaps the name fields — Organization shows
        // "Organization Name", no "Given Name" — and switching back leaves
        // what was typed on screen (the discard is save-time only).
        await screen.fillPersonFields(dialog, {given: 'Carla'});
        await dialog.getByRole('radio', {name: 'Organization or group', exact: true}).check();
        await expect(screen.field(dialog, /^Organization Name/)).toBeVisible();
        await expect(screen.field(dialog, /^Given Name/)).toBeHidden();
        await dialog.getByRole('radio', {name: 'Person', exact: true}).check();
        await expect(dialog.locator('input[name^="givenName"]').first()).toHaveValue(
            'Carla'
        );

        // Complete the person (Given Name, Email, Country, the "Author"
        // role) and save: the panel closes, the row shows the role badge.
        await screen.fillPersonFields(dialog, {
            email: `${tag}carla@mail.test`,
            country: 'Canada',
        });
        await screen.setRole(dialog, 'Author', true);
        await screen.savePanel(dialog);
        await expect(screen.row('Carla')).toBeVisible();
        await expect(screen.roleBadge('Carla', 'Author')).toBeVisible();

        // A second contributor as "Organization or group".
        dialog = await screen.openAdd();
        await dialog.getByRole('radio', {name: 'Organization or group', exact: true}).check();
        await dialog.locator('input[name^="organizationName"]').first().fill(orgName);
        await screen.fillPersonFields(dialog, {
            email: `${tag}org@mail.test`,
            country: 'Canada',
        });
        await screen.setRole(dialog, 'Author', true);
        await screen.savePanel(dialog);
        await expect(screen.row(orgName)).toBeVisible();

        // "Edit" opens the same panel prefilled; add a Family Name — the
        // row updates in place (Rule 4).
        dialog = await screen.openRowEdit('Carla');
        await expect(dialog.locator('input[name^="givenName"]').first()).toHaveValue(
            'Carla'
        );
        await screen.fillPersonFields(dialog, {family: 'Kay'});
        await screen.savePanel(dialog);
        await expect(screen.row('Carla Kay')).toBeVisible();

        // "Delete" asks for confirmation (Rule 5): Cancel keeps the row;
        // confirming removes the contributor.
        let confirm = await screen.openRowDelete(orgName);
        await expect(confirm.getByText(`remove ${orgName} as a contributor`)).toBeVisible();
        await expect(confirm.getByText('This action can not be undone.')).toBeVisible();
        await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(confirm).toHaveCount(0, {timeout: 30_000});
        await expect(screen.row(orgName)).toBeVisible();

        confirm = await screen.openRowDelete(orgName);
        const deleted = page.waitForResponse(
            (r) =>
                r.url().includes('/contributors/') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await confirm.getByRole('button', {name: 'Delete Contributor', exact: true}).click();
        await deleted;
        await expect(screen.row(orgName)).toHaveCount(0, {timeout: 30_000});
        await expect(screen.row('Carla Kay')).toBeVisible();
    });

    test('S2: reorder and preview the display formats', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const family = `B${tag}`;
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        let screen = await openContributors(page, PK, submissionId);
        await screen.addContributor({
            given: 'Bora',
            family,
            email: `${tag}bora@mail.test`,
        });
        // Pin the starting order (submitter first) — see pinOrder.
        await pinOrder(page, screen, 'Alex Author');
        await expect(screen.rows().first()).toContainText('Alex Author');

        // Preview (Rule 7): "Abbreviated" is the first contributor's
        // family name plus "et al."; "Full" lists both names with their
        // roles in parentheses, semicolon-separated; the "Publication
        // Lists" row is the third format.
        let preview = await screen.openPreview();
        await expect(screen.previewRow(preview, 'Abbreviated')).toContainText(
            'Author et al.'
        );
        await expect(screen.previewRow(preview, 'Full')).toContainText(
            `Alex Author (Author); Bora ${family} (Author)`
        );
        await expect(screen.previewRow(preview, 'Publication Lists')).toBeVisible();
        await screen.closePreview(preview);

        // Ordering mode (Rule 6): Preview and Add Contributor give way to
        // Cancel, the button relabels "Save Order", the rows carry named
        // up/down arrows. Move the second contributor up and save.
        await screen.orderButton().click();
        await expect(screen.saveOrderButton()).toBeVisible();
        await expect(screen.cancelOrderingButton()).toBeVisible();
        await expect(screen.previewButton()).toBeHidden();
        await expect(screen.addContributorButton()).toBeHidden();
        // Content-verified reorder (see pinOrder): each bounded attempt
        // (re-)enters ordering, redoes the move, saves with a freshly armed
        // response wait, and passes only when the screen — re-rendered from
        // the response — shows the new order (the remount race can
        // otherwise persist the OLD order: response ok, content wrong).
        await expect(async () => {
            if (!(await screen.saveOrderButton().isVisible())) {
                await screen.orderButton().click({timeout: 2_000});
            }
            await page
                .getByRole('button', {name: `Increase position of Bora ${family}`})
                .click({timeout: 2_000});
            await expect(screen.rows().first()).toContainText(`Bora ${family}`, {
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
            await expect(screen.rows().first()).toContainText(`Bora ${family}`, {
                timeout: 5_000,
            });
        }).toPass({intervals: [1_000, 2_000], timeout: 120_000});

        // Reload: the order holds, and "Abbreviated" now names the other
        // family name (Preview re-fetches the publication).
        screen = await openContributors(page, PK, submissionId);
        await expect(screen.rows().first()).toContainText(`Bora ${family}`);
        await expect(screen.rows().nth(1)).toContainText('Alex Author');
        preview = await screen.openPreview();
        await expect(screen.previewRow(preview, 'Abbreviated')).toContainText(
            `${family} et al.`
        );
        await screen.closePreview(preview);

        // Order again, move a row, Cancel — the saved order is back.
        await screen.orderButton().click();
        await page
            .getByRole('button', {name: 'Increase position of Alex Author'})
            .click();
        await expect(screen.rows().first()).toContainText('Alex Author');
        await screen.cancelOrderingButton().click();
        await expect(screen.rows().first()).toContainText(`Bora ${family}`, {
            timeout: 30_000,
        });
        await expect(screen.orderButton()).toBeVisible();
    });

    test('S3: move the primary contact', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const family = `P${tag}`;
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        const screen = await openContributors(page, PK, submissionId);
        await screen.addContributor({
            given: 'Pia',
            family,
            email: `${tag}pia@mail.test`,
        });

        // The submitting author's row carries the badge; the other row
        // offers "Set Primary Contact" (Rule 10).
        await expect(screen.primaryContactBadge('Alex Author')).toBeVisible();
        await expect(screen.setPrimaryContactButton(`Pia ${family}`)).toBeVisible();

        // Pressing it moves the badge at once — no confirmation dialog,
        // just the publication save.
        await screen.setPrimaryContact(`Pia ${family}`);
        await expect(screen.primaryContactBadge(`Pia ${family}`)).toBeVisible({
            timeout: 30_000,
        });
        await expect(screen.setPrimaryContactButton('Alex Author')).toBeVisible();
        await expect(screen.primaryContactBadge('Alex Author')).toHaveCount(0);

        // The choice persists across a reload.
        const reloaded = await openContributors(page, PK, submissionId);
        await expect(reloaded.primaryContactBadge(`Pia ${family}`)).toBeVisible();
        // (The delete-the-primary-contact leg is the open question A2 —
        // not exercised either way; see the file header.)
    });

    test('S4: record typed affiliations with per-language names', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const instA = `Alpha Institute ${tag}`;
        const instAFr = `Institut Alpha ${tag}`;
        const instB = `Beta Institute ${tag}`;
        await ompApi.createContext(
            scratchPressSpec(tag, {locales: ['en', 'fr_CA']})
        );
        const {submissionId} = await ompApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
            locale: 'en',
        });

        const page = await (await asUser(`${tag}mg`)).newPage();
        await stubRegistrySearch(page);
        const screen = await openContributors(page, tag, submissionId);

        // Typed path: text alone offers no "Add" — it appears only once a
        // suggestion (here the typed text itself) is picked. (The seeded
        // contributor arrives without a Country — filled once so the later
        // saves exercise only the affiliation rules.)
        let dialog = await screen.openRowEdit('Ada Author');
        await screen.fillPersonFields(dialog, {country: 'Canada'});
        await screen.typeInstitution(dialog, instA);
        await expect(screen.suggestion(dialog, instA)).toBeVisible();
        await expect(screen.affiliationAddButton(dialog)).toHaveCount(0);
        await screen.suggestion(dialog, instA).click();
        await expect(screen.affiliationAddButton(dialog)).toBeVisible();
        await screen.affiliationAddButton(dialog).click();

        // The typed row carries a completeness status and, via its "…"
        // menu, "Edit institution name" with one box per language.
        const rowA = screen.affiliationRow(dialog, instA);
        await expect(rowA).toBeVisible();
        await expect(rowA).toContainText('1 of 2 languages completed');
        await screen.openAffiliationRowAction(dialog, instA, 'Edit institution name');
        const boxes = screen.affiliationNameBoxes(dialog, instA);
        await expect(boxes).toHaveCount(2);
        await boxes.nth(1).fill(instAFr);
        await expect(rowA).toContainText('All translations available');

        // A second typed institution; save the contributor and reopen —
        // both are there (any number of affiliations).
        await screen.addTypedInstitution(dialog, instB);
        await screen.savePanel(dialog);
        dialog = await screen.openRowEdit('Ada Author');
        await expect(screen.affiliationRow(dialog, instA)).toBeVisible();
        await expect(screen.affiliationRow(dialog, instB)).toBeVisible();

        // A save without the submission language's name is refused with
        // the inline message (Fields & validation; the garbled summary
        // line of A7 is never asserted).
        await screen.openAffiliationRowAction(dialog, instA, 'Edit institution name');
        await screen.affiliationNameBoxes(dialog, instA).first().fill('');
        await dialog.getByRole('button', {name: 'Save', exact: true}).click();
        await expect(
            dialog.getByText(
                'Please provide affiliation name in the submission primary locale.'
            )
        ).toBeVisible({timeout: 30_000});

        // Restore the name (the emptied row is re-anchored by its
        // primary-language-required marker) and remove the second
        // institution: "Are you sure?" — Yes deletes it.
        const emptiedRow = screen
            .affiliationsField(dialog)
            .getByRole('row')
            .filter({hasText: 'The primary language English is required'});
        await emptiedRow.locator('input[name="name"]').first().fill(instA);
        await screen.openAffiliationRowAction(dialog, instB, 'Remove institution');
        const confirm = page
            .getByRole('dialog')
            .filter({hasText: 'will be deleted'});
        await expect(confirm.getByText('Are you sure?')).toBeVisible();
        await confirm.getByRole('button', {name: 'Yes', exact: true}).click();
        await expect(screen.affiliationRow(dialog, instB)).toHaveCount(0, {
            timeout: 30_000,
        });
        await screen.savePanel(dialog);

        // The removal and the restored name persisted.
        dialog = await screen.openRowEdit('Ada Author');
        await expect(screen.affiliationRow(dialog, instA)).toBeVisible();
        await expect(screen.affiliationRow(dialog, instB)).toHaveCount(0);
    });

    test('S5: manage the press contributor roles', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const roleName = `Chair${tag}`;
        await ompApi.createContext(scratchPressSpec(tag));
        const {submissionId} = await ompApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
        });

        const page = await (await asUser(`${tag}mg`)).newPage();

        // A press starts with FOUR roles (Rule 11's press leg).
        await openContributorRolesSettings(page, tag);
        await expect(roleRow(page, 'Author')).toContainText('AUTHOR');
        await expect(roleRow(page, 'Translator')).toContainText('TRANSLATOR');
        await expect(roleRow(page, 'Chapter Author')).toContainText('AUTHOR');
        await expect(roleRow(page, 'Volume editor')).toContainText('EDITOR');

        // Add a CHAIR role; the row appears (Rule 12).
        await page.getByRole('button', {name: 'Add Role', exact: true}).click();
        const addDialog = page.getByRole('dialog', {name: 'Add Role'});
        await expect(addDialog).toBeVisible({timeout: 30_000});
        await addDialog.locator('select').selectOption('CHAIR');
        await addDialog.locator('input[name^="name"]').first().fill(roleName);
        const roleSaved = page.waitForResponse(
            (r) =>
                r.url().includes('/contributorRoles') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await addDialog.getByRole('button', {name: 'Save', exact: true}).click();
        await roleSaved;
        await expect(addDialog).toHaveCount(0, {timeout: 30_000});
        await expect(roleRow(page, roleName)).toContainText('CHAIR');

        // Tick the new role on a contributor — its badge joins the row.
        // (The seeded contributor arrives without a Country — filled once
        // so the form's own required check stays out of the way.)
        let screen = await openContributors(page, tag, submissionId);
        let dialog = await screen.openRowEdit('Ada Author');
        await screen.fillPersonFields(dialog, {country: 'Canada'});
        await screen.setRole(dialog, roleName, true);
        await screen.savePanel(dialog);
        await expect(screen.roleBadge('Ada Author', roleName)).toBeVisible();

        // Deleting a role a contributor holds is refused after the
        // type-to-confirm (Rule 13).
        await openContributorRolesSettings(page, tag);
        await openRoleRowAction(page, roleName, 'Delete Role');
        let confirmDialog = typeToConfirmDialog(page);
        await expect(
            confirmDialog.getByText(
                'Are you absolutely sure you want to delete "CHAIR" role?'
            )
        ).toBeVisible({timeout: 30_000});
        await confirmDialog.getByRole('textbox').fill('CHAIR');
        await confirmDeleteButton(confirmDialog).click();
        let errorDialog = page
            .getByRole('dialog')
            .filter({hasText: 'One or more contributors are using this role'});
        await expect(errorDialog).toBeVisible({timeout: 30_000});
        await errorDialog.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(errorDialog).toHaveCount(0, {timeout: 30_000});
        await expect(roleRow(page, roleName)).toBeVisible();

        // Untick the role, then delete it: the confirm button enables
        // only on an exact identifier match, and "Role Deleted" confirms.
        screen = await openContributors(page, tag, submissionId);
        dialog = await screen.openRowEdit('Ada Author');
        await screen.setRole(dialog, roleName, false);
        await screen.savePanel(dialog);

        await openContributorRolesSettings(page, tag);
        await openRoleRowAction(page, roleName, 'Delete Role');
        confirmDialog = typeToConfirmDialog(page);
        await expect(confirmDialog).toBeVisible({timeout: 30_000});
        await expect(confirmDeleteButton(confirmDialog)).toBeDisabled();
        await confirmDialog.getByRole('textbox').fill('CHAI');
        await expect(confirmDeleteButton(confirmDialog)).toBeDisabled();
        await confirmDialog.getByRole('textbox').fill('CHAIR');
        await expect(confirmDeleteButton(confirmDialog)).toBeEnabled();
        await confirmDeleteButton(confirmDialog).click();
        let deletedDialog = page
            .getByRole('dialog')
            .filter({hasText: '"CHAIR" has been successfully deleted.'});
        await expect(deletedDialog.getByText('Role Deleted')).toBeVisible({
            timeout: 30_000,
        });
        await deletedDialog
            .getByRole('button', {name: 'Back to Contributor Roles', exact: true})
            .click();
        await expect(roleRow(page, roleName)).toHaveCount(0, {timeout: 30_000});

        // Press-flavored last-AUTHOR leg: with the contributor moved to
        // Translator and "Chapter Author" (the other AUTHOR role) deleted,
        // "Author" is the last AUTHOR-identifier role and cannot be
        // deleted.
        screen = await openContributors(page, tag, submissionId);
        dialog = await screen.openRowEdit('Ada Author');
        await screen.setRole(dialog, 'Translator', true);
        await screen.setRole(dialog, 'Author', false);
        await screen.savePanel(dialog);
        await expect(screen.roleBadge('Ada Author', 'Translator')).toBeVisible();

        await openContributorRolesSettings(page, tag);
        await openRoleRowAction(page, 'Chapter Author', 'Delete Role');
        confirmDialog = typeToConfirmDialog(page);
        await confirmDialog.getByRole('textbox').fill('AUTHOR');
        await confirmDeleteButton(confirmDialog).click();
        deletedDialog = page
            .getByRole('dialog')
            .filter({hasText: '"AUTHOR" has been successfully deleted.'});
        await expect(deletedDialog.getByText('Role Deleted')).toBeVisible({
            timeout: 30_000,
        });
        await deletedDialog
            .getByRole('button', {name: 'Back to Contributor Roles', exact: true})
            .click();
        await expect(roleRow(page, 'Chapter Author')).toHaveCount(0, {timeout: 30_000});

        await openRoleRowAction(page, 'Author', 'Delete Role');
        confirmDialog = typeToConfirmDialog(page);
        await confirmDialog.getByRole('textbox').fill('AUTHOR');
        await confirmDeleteButton(confirmDialog).click();
        errorDialog = page
            .getByRole('dialog')
            .filter({hasText: 'Last AUTHOR role cannot be deleted.'});
        await expect(errorDialog).toBeVisible({timeout: 30_000});
        await errorDialog.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(errorDialog).toHaveCount(0, {timeout: 30_000});
        await expect(roleRow(page, 'Author')).toBeVisible();
    });

    test('S6: readers see the contributors', async ({asUser, ompApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const family = `Bee${tag}`;
        const inst = `Institute ${tag}`;
        const bio = `Ada studies contributor lists ${tag}.`;
        await ompApi.createContext(scratchPressSpec(tag));
        const {submissionId} = await ompApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            published: true,
        });

        // First-listed contributor: typed affiliation, Bio Statement, two
        // roles; second contributor: plain (published pages stay editable
        // for the manager — Actors & permissions).
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await stubRegistrySearch(managerPage);
        const screen = await openContributors(managerPage, tag, submissionId);
        let dialog = await screen.openRowEdit('Ada Author');
        await screen.fillPersonFields(dialog, {country: 'Canada'});
        await screen.setRole(dialog, 'Translator', true);
        await screen.addTypedInstitution(dialog, inst);
        const bioBody = screen.richBody(dialog, /^Bio Statement/);
        await bioBody.click();
        await bioBody.fill(bio);
        await screen.savePanel(dialog);
        await screen.addContributor({
            given: 'Bob',
            family,
            email: `${tag}bob@mail.test`,
        });
        // Pin the list order (Ada first) — see pinOrder.
        await pinOrder(managerPage, screen, 'Ada Author');

        // The book page credits both in list order: names, the typed
        // affiliation's name, and the contributor role names (Rule 14).
        await page.goto(bookUrl(tag, submissionId));
        const authorsBlock = page.locator('.item.authors');
        const credits = authorsBlock.locator('.sub_item');
        await expect(credits).toHaveCount(2, {timeout: 30_000});
        await expect(credits.first()).toContainText('Ada Author');
        await expect(credits.first().locator('.value.affiliation')).toContainText(inst);
        await expect(credits.first().locator('.contributor_roles')).toContainText(
            'Author'
        );
        await expect(credits.first().locator('.contributor_roles')).toContainText(
            'Translator'
        );
        await expect(credits.nth(1)).toContainText(`Bob ${family}`);
        await expect(credits.nth(1).locator('.value.affiliation')).toHaveCount(0);
        await expect(credits.nth(1).locator('.contributor_roles')).toContainText(
            'Author'
        );

        // One contributor with a Bio Statement → the singular "Author
        // Biography" section, "{name}, {affiliation}" above the statement.
        const bios = page.locator('.item.author_bios');
        await expect(bios.getByRole('heading', {name: 'Author Biography'})).toBeVisible();
        await expect(bios).toContainText('Ada Author,');
        await expect(bios).toContainText(inst);
        await expect(bios).toContainText(bio);

        // The catalog listing shows the author line in the "Full" format —
        // names with roles in parentheses (Rule 15).
        await page.goto(catalogUrl(tag));
        const summary = page
            .locator('.obj_monograph_summary')
            .filter({hasText: `Submission ${tag}`});
        const authorLine = summary.locator('.author');
        await expect(authorLine).toContainText('Ada Author (', {timeout: 30_000});
        await expect(authorLine).toContainText('Translator');
        await expect(authorLine).toContainText(`Bob ${family} (Author)`);
    });

    test('S7: the publication-lists tick governs the press catalog listing', async ({asUser, ompApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const family = `Cee${tag}`;
        await ompApi.createContext(scratchPressSpec(tag));
        const {submissionId} = await ompApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            published: true,
        });

        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        const screen = await openContributors(managerPage, tag, submissionId);
        await screen.addContributor({
            given: 'Cara',
            family,
            email: `${tag}cara@mail.test`,
        });

        // Untick "Publication Lists" on the second contributor (Rule 8).
        const dialog = await screen.openRowEdit(`Cara ${family}`);
        await dialog
            .getByRole('checkbox', {
                name: 'Include this contributor when identifying authors in lists of publications.',
            })
            .uncheck();
        await screen.savePanel(dialog);

        // Preview: the "Publication Lists" format omits them while "Full"
        // keeps them (each absence bounded by the same row naming Ada).
        const preview = await screen.openPreview();
        const listsRow = screen.previewRow(preview, 'Publication Lists');
        await expect(listsRow).toContainText('Ada Author');
        await expect(listsRow).not.toContainText(`Cara ${family}`);
        await expect(screen.previewRow(preview, 'Full')).toContainText(
            `Cara ${family}`
        );
        await screen.closePreview(preview);

        // The landing page still credits both…
        await page.goto(bookUrl(tag, submissionId));
        const authorsBlock = page.locator('.item.authors');
        await expect(authorsBlock).toContainText('Ada Author');
        await expect(authorsBlock).toContainText(`Cara ${family}`);

        // …while the press's catalog listing — the one reader listing that
        // honors the tick — drops the unticked contributor (the absence
        // bounded by the same line naming Ada).
        await page.goto(catalogUrl(tag));
        const authorLine = page
            .locator('.obj_monograph_summary')
            .filter({hasText: `Submission ${tag}`})
            .locator('.author');
        await expect(authorLine).toContainText('Ada Author', {timeout: 30_000});
        await expect(authorLine).not.toContainText(`Cara ${family}`);
    });

    test('S8: require competing interests', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        await ompApi.createContext(scratchPressSpec(tag));
        const {submissionId} = await ompApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
        });

        // Tick the requirement on the workflow settings' Metadata screen.
        const page = await (await asUser(`${tag}mg`)).newPage();
        await openMetadataSettings(page, tag);
        const form = metadataSettingsForm(page);
        await form
            .getByRole('checkbox', {
                name: 'Require submitting Authors to file a Competing Interest (CI) statement with their submission.',
            })
            .check();
        await saveSettingsForm(page, form);

        // The contributor form now carries the required field; a save with
        // it empty never leaves the form (Fields & validation).
        const screen = await openContributors(page, tag, submissionId);
        let dialog = await screen.openAdd();
        await expect(screen.field(dialog, /^Competing Interests/)).toBeVisible();
        await expect(
            dialog.getByText(
                'Please disclose any competing interests this author may have with the research subject.'
            )
        ).toBeVisible();
        await screen.fillPersonFields(dialog, {
            given: 'Nia',
            email: `${tag}nia@mail.test`,
            country: 'Canada',
        });
        await screen.setRole(dialog, 'Author', true);
        await dialog.getByRole('button', {name: 'Save', exact: true}).click();
        await expect(dialog.getByText('Please correct one error.')).toBeVisible({
            timeout: 30_000,
        });
        await expect(dialog.getByText('This field is required.').first()).toBeVisible();
        await expect(dialog.getByText('Jump to next error')).toBeVisible();

        // Filling the statement saves.
        const ciBody = screen.richBody(dialog, /^Competing Interests/);
        await ciBody.click();
        await ciBody.fill(`Nothing to disclose ${tag}.`);
        await screen.savePanel(dialog);
        await expect(screen.row('Nia')).toBeVisible();

        // Unticking the setting removes the field from the form (bounded
        // by the form's Email field rendering).
        await openMetadataSettings(page, tag);
        await form
            .getByRole('checkbox', {
                name: 'Require submitting Authors to file a Competing Interest (CI) statement with their submission.',
            })
            .uncheck();
        await saveSettingsForm(page, form);

        const screen2 = await openContributors(page, tag, submissionId);
        dialog = await screen2.openRowEdit('Nia');
        await expect(dialog.locator('input[name="email"]')).toBeVisible();
        await expect(screen2.field(dialog, /^Competing Interests/)).toHaveCount(0);
    });

    test('OMP1: five or more contributors compact the book page credits', async ({asUser, ompApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('o1', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            published: true,
        });

        // Four more contributors (five with the submitter), none with an
        // affiliation — so the compacted line's dangling-comma symptom
        // (A1) never renders and the clean layout is what is asserted.
        const managerPage = await (await asUser('manager.maya')).newPage();
        const screen = await openContributors(managerPage, PK, submissionId);
        const givens = ['Cara', 'Dana', 'Erik', 'Fola'];
        for (const [i, given] of givens.entries()) {
            await screen.addContributor({
                given,
                family: `F${i}${tag}`,
                email: `${tag}c${i}@mail.test`,
            });
        }

        // The book page compacts the credits to a single flowed line of
        // semicolon-joined names: no per-contributor blocks, no role names.
        // (Name order is not asserted — this test never pins an order and
        // S6's rule is presence, not order; see the file header.)
        await page.goto(bookUrl(PK, submissionId));
        const authorsBlock = page.locator('.item.authors');
        await expect(authorsBlock).toContainText('Alex Author', {timeout: 30_000});
        for (const [i, given] of givens.entries()) {
            await expect(authorsBlock).toContainText(`${given} F${i}${tag}`);
        }
        await expect(authorsBlock).toContainText(';');
        await expect(authorsBlock.locator('.sub_item')).toHaveCount(0);
        await expect(authorsBlock.locator('.contributor_roles')).toHaveCount(0);
    });

    test('OMP2: an Edited Volume credits its volume editors', async ({asUser, ompApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('o2', testInfo);
        const family = `Ved${tag}`;
        await ompApi.createContext(scratchPressSpec(tag));
        const {submissionId} = await ompApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Volume ${tag}`,
            workType: 'editedVolume',
            decisions: ['skipExternalReview', 'sendToProduction'],
            published: true,
        });

        // A contributor holding the press's "Volume editor" role (EDITOR
        // identifier) alongside the plain submitting author.
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        const screen = await openContributors(managerPage, tag, submissionId);
        await screen.addContributor({
            given: 'Vera',
            family,
            email: `${tag}vera@mail.test`,
            roles: ['Volume editor'],
        });

        // The book page credits the volume editor — name suffixed "(ed)",
        // with the role name — in place of the contributor list (the
        // absent author bounded by the editor's credit in the same block).
        await page.goto(bookUrl(tag, submissionId));
        const authorsBlock = page.locator('.item.authors');
        await expect(authorsBlock).toContainText(`Vera ${family} (ed)`, {
            timeout: 30_000,
        });
        await expect(authorsBlock.locator('.contributor_roles')).toContainText(
            'Volume editor'
        );
        await expect(authorsBlock).not.toContainText('Ada Author');

        // The catalog's listing line keeps the full contributor list.
        await page.goto(catalogUrl(tag));
        const authorLine = page
            .locator('.obj_monograph_summary')
            .filter({hasText: `Volume ${tag}`})
            .locator('.author');
        await expect(authorLine).toContainText('Ada Author (Author)', {
            timeout: 30_000,
        });
        await expect(authorLine).toContainText(`Vera ${family} (Volume editor)`);
    });

    test("OMP-A: the author's workflow contributors list is read-only", async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('oa', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        // Positive control (the editable side, taken the same way): the
        // manager's view offers Order, Add Contributor and the row actions.
        const managerPage = await (await asUser('manager.maya')).newPage();
        const managerScreen = await openContributors(managerPage, PK, submissionId);
        await expect(managerScreen.orderButton()).toBeVisible();
        await expect(managerScreen.addContributorButton()).toBeVisible();
        const managerRow = managerScreen.row('Alex Author');
        await expect(managerRow.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
        await expect(managerRow.getByRole('button', {name: 'Delete', exact: true})).toBeVisible();

        // The submitting author sees the same list read-only on a press
        // (Rule 9; the editable-author case is OPS-only — OPS1): the rows
        // with their role badges and the working "Preview" remain, and
        // every other control is absent entirely — nothing grayed out.
        const authorPage = await (await asUser('author.alex')).newPage();
        const authorScreen = await openContributors(authorPage, PK, submissionId, {
            author: true,
        });
        const authorRow = authorScreen.row('Alex Author');
        await expect(authorRow).toBeVisible();
        await expect(authorScreen.roleBadge('Alex Author', 'Author')).toBeVisible();
        await expect(authorScreen.orderButton()).toHaveCount(0);
        await expect(authorScreen.addContributorButton()).toHaveCount(0);
        await expect(authorRow.getByRole('button', {name: 'Edit', exact: true})).toHaveCount(0);
        await expect(authorRow.getByRole('button', {name: 'Delete', exact: true})).toHaveCount(0);
        await expect(
            authorRow.getByRole('button', {name: 'Set Primary Contact', exact: true})
        ).toHaveCount(0);
        // (Whether the "Primary Contact" badge should show here is the
        // open question A6 — not asserted either way.)

        const preview = await authorScreen.openPreview();
        await expect(
            authorScreen.previewRow(preview, 'Full')
        ).toContainText('Alex Author (Author)');
        await authorScreen.closePreview(preview);
    });
});
