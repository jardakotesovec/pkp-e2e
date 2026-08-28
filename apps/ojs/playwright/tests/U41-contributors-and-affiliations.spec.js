// @ts-check
/**
 * @file playwright/tests/U41-contributors-and-affiliations.spec.js
 *
 * Contributors & affiliations — OJS suite, one test per canonical COMMON
 * scenario (spec scenarios 1–8) plus the OJS-side read-only rule (Rule 9 /
 * Actors & permissions — the journal author's workflow list is read-only,
 * the counterpart of the spec's OPS1 contrast).
 * Spec: docs/specs/U41-contributors-and-affiliations.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - The registry-backed affiliation leg of scenario 4 (a suggestion with the
 *   ROR mark, the row's registry link, the landing page's ROR-mark link of
 *   Rule 14): on this install the server has no outbound internet, so a
 *   registry pick deterministically fails per A5 🐞 — and a 🐞 finding is
 *   never asserted as contract. Every affiliation here takes the typed-name
 *   path; the browser-side registry query is stubbed to an empty result set
 *   for hermeticity (the typed-text option renders independently of it).
 * - A1 🐞: nothing asserts the rows' affiliation line (empty or otherwise).
 * - A2 ❓: S3 stops at the badge moving — the delete-the-primary-contact
 *   aftermath (no badge anywhere, the publish flow's silence) is A2's open
 *   question and is not asserted.
 * - A3 🐞: S7 asserts only the Preview rows and the landing page; no OJS
 *   listing is checked for the unticked contributor (journal listings
 *   ignore the tick — the buggy path), and Rule 8's "Abbreviated ignores
 *   the tick" disagreement is likewise left alone.
 * - A4 ❓: S1 saves the organization contributor without touching the
 *   "ROR ID" box.
 * - A6 ❓: the read-only test asserts the absent controls only, not the
 *   "Primary Contact" badge's absence (whether the badge should stay is
 *   A6's question).
 * - A7 🐞 / A8 ❓ / A11 ❓: no test triggers an affiliation validation
 *   error, saves with typed-but-unpicked search text, or simulates a
 *   registry-error dialog.
 * - A9 🐞 / A10 🐞: the accessibility findings (unnamed ROR link, wrongly
 *   announced name boxes) are not asserted.
 * - A12 🐞: the delete-role confirm button is reached as "the non-Cancel
 *   button"; its (mislabeled) text is never asserted.
 * - A13 ❓: S5 runs on a single-language scratch journal, so the
 *   empty-other-language role-name save is never exercised.
 * - A14 🐞: no test reduces a journal to a single contributor role.
 * - Rule 17 (contributors withheld from anonymized review) is observable
 *   only in the reviewer's payload, with no screen surface to assert —
 *   left to the spec's payload evidence.
 * - Side-effect silence ("no email, no notification, no activity-log
 *   entry"): a silence claim with no natural in-test positive control; not
 *   asserted (no Mailpit use in this suite).
 * - The wizard's Contributors step (shell, gates, the auto-created
 *   contributor) is U21's; versioning's contributor copy belongs to
 *   Publish, schedule & versions; the ORCID field states are U04's.
 * - NEW FINDING (proposed for the spec's register, not yet filed): a
 *   contributor added through the panel to a publication whose only
 *   contributor is the auto-created author gets sequence 0 — the SAME
 *   sequence as the existing author (`AuthorDAO::getNextSeq()` treats a
 *   max seq of 0 as "no contributors": `if ($seq)`), so "the first
 *   contributor" (rows, author strings, reader pages) is nondeterministic
 *   until an order is saved. This contradicts Rule 6's "joins at the end
 *   of the list". S2 and S6 avoid the tied path by pinning an explicit
 *   order (Save Order persists seq 0..n) before any order-dependent
 *   assertion.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only (S5's role mutations and S8's setting mutation run on
 * scratch journals with throwaway users; S6 publishes into the seeded
 * back issue via the sanctioned issue overlay, mutating no journal
 * settings). Waits are event-based (API responses, web-first assertions)
 * — no hard sleeps. Everything runs in the parallel `ojs` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    ContributorsPanel,
    ContributorRolesScreen,
} = require('../pages/ContributorPages.js');
const {stubRegistrySearch} = require('../pages/FundingPages.js');
const {
    PublicationScreen,
    waitForContextSettingsSave,
} = require('../pages/PublicationMetadataPages.js');

const JOURNAL = 'publicknowledge';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u41${scenario}w${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Seed a scratch journal with one throwaway manager and one throwaway
 * author; returns their usernames.
 */
async function seedJournal(ojsApi, tag, {bilingual = false} = {}) {
    const context = bilingual
        ? {
              primaryLocale: 'en',
              supportedLocales: ['en', 'fr_CA'],
              supportedSubmissionLocales: ['en', 'fr_CA'],
          }
        : undefined;
    await ojsApi.createContext({
        tag,
        ...(context ? {context} : {}),
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
    return {manager: `${tag}mg`, author: `${tag}au`};
}

/** Open the workflow's Contributors page and return the panel POM. */
async function openContributors(page, contextPath, submissionId, {author = false} = {}) {
    const pub = new PublicationScreen(page, contextPath);
    await pub.gotoWorkflow(submissionId, {author});
    await pub.openEntry('Contributors');
    return new ContributorsPanel(page);
}

test.describe('contributors and affiliations', () => {
    test('S1: maintain the contributor list', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        const panel = await openContributors(page, JOURNAL, submissionId);

        // The submitting author is already listed with an "Author" role
        // badge and the "Primary Contact" badge (Rules 3, 10).
        await expect(panel.row('Alex Author')).toBeVisible({timeout: 30_000});
        await expect(panel.badge('Alex Author', 'Author')).toBeVisible();
        await expect(panel.badge('Alex Author', 'Primary Contact')).toBeVisible();

        // "Add Contributor" opens the panel on Contributor Type = Person,
        // with the type-switch guidance (Fields & validation).
        let dialog = await panel.openAdd();
        await expect(
            dialog.getByText('Selecting a contributor type will determine')
        ).toBeVisible();
        await expect(
            dialog.getByRole('radio', {name: 'Person', exact: true})
        ).toBeChecked();

        // A save with the required Country missing is refused in place:
        // field message, foot summary and the jump link (Fields &
        // validation's refusal shape).
        await panel.fillPerson(dialog, {given: 'Vera', email: `${tag}p@mail.test`});
        await panel.tickRole(dialog, 'Author');
        await dialog.getByRole('button', {name: 'Save', exact: true}).click();
        await expect(dialog.getByText('Please correct one error.')).toBeVisible({
            timeout: 30_000,
        });
        await expect(dialog.getByText('This field is required.').first()).toBeVisible();
        await expect(
            dialog.getByRole('button', {name: 'Jump to next error'})
        ).toBeVisible();

        // Correcting the field lets the save through; the panel closes and
        // the new row shows the name with an "Author" badge (Rule 4).
        await panel.fillPerson(dialog, {country: 'Canada'});
        await panel.savePanel(dialog);
        await expect(panel.row('Vera')).toBeVisible({timeout: 30_000});
        await expect(panel.badge('Vera', 'Author')).toBeVisible();

        // An "Organization or group" contributor: the name fields swap to
        // "Organization Name" (person name fields leave the form).
        dialog = await panel.openAdd();
        await dialog
            .getByRole('radio', {name: 'Organization or group', exact: true})
            .check();
        await expect(dialog.locator('input[name="organizationName-en"]')).toBeVisible({
            timeout: 30_000,
        });
        await expect(dialog.locator('input[name="givenName-en"]')).toHaveCount(0);
        await dialog.locator('input[name="organizationName-en"]').fill(`Orgo${tag}`);
        await panel.fillPerson(dialog, {email: `${tag}o@mail.test`, country: 'Canada'});
        await panel.tickRole(dialog, 'Author');
        await panel.savePanel(dialog);
        await expect(panel.row(`Orgo${tag}`)).toBeVisible({timeout: 30_000});

        // "Edit" opens the same panel prefilled; the row updates in place.
        dialog = await panel.openEdit('Vera');
        await expect(dialog.locator('input[name="givenName-en"]')).toHaveValue('Vera', {
            timeout: 30_000,
        });
        await panel.fillPerson(dialog, {family: 'Villanueva'});
        await panel.savePanel(dialog);
        await expect(panel.row('Vera Villanueva')).toBeVisible({timeout: 30_000});

        // Delete the organization: the "Delete Contributor" dialog carries
        // the named warning; Cancel keeps the row, confirming removes it.
        await panel
            .row(`Orgo${tag}`)
            .getByRole('button', {name: 'Delete', exact: true})
            .click();
        let confirm = panel.deleteDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await expect(confirm).toContainText(
            `Are you sure you want to remove Orgo${tag} as a contributor? This action can not be undone.`
        );
        await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(confirm).toHaveCount(0, {timeout: 30_000});
        await expect(panel.row(`Orgo${tag}`)).toBeVisible();

        await panel
            .row(`Orgo${tag}`)
            .getByRole('button', {name: 'Delete', exact: true})
            .click();
        confirm = panel.deleteDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        const deleted = page.waitForResponse(
            (r) =>
                r.url().includes('/contributors') &&
                r.request().method() === 'POST' &&
                r.ok(),
            {timeout: 30_000}
        );
        await confirm
            .getByRole('button', {name: 'Delete Contributor', exact: true})
            .click();
        await deleted;
        await expect(panel.row(`Orgo${tag}`)).toHaveCount(0, {timeout: 30_000});
        await expect(panel.row('Vera Villanueva')).toBeVisible();
    });

    test('S2: reorder and preview the display formats', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s2', testInfo);
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        let panel = await openContributors(page, JOURNAL, submissionId);

        // A second contributor with a distinct family name.
        const dialog = await panel.openAdd();
        await panel.fillPerson(dialog, {
            given: 'Zoe',
            family: 'Zephyr',
            email: `${tag}z@mail.test`,
            country: 'Canada',
        });
        await panel.tickRole(dialog, 'Author');
        await panel.savePanel(dialog);
        await expect(panel.row('Zoe Zephyr')).toBeVisible({timeout: 30_000});

        // Pin the starting order (Alex first) with an explicit Save Order:
        // the panel-added contributor ties the auto-created author at
        // sequence 0, so the untouched order is nondeterministic (see the
        // file header).
        await panel.makeFirst('Alex Author');
        await expect(panel.rows().nth(1)).toContainText('Zoe Zephyr');

        // Preview (Rule 7): "Abbreviated" is the first contributor's family
        // name plus "et al."; "Full" both names with "(Author)".
        let preview = await panel.openPreview();
        await expect(panel.previewValue(preview, 'Abbreviated')).toHaveText(
            'Author et al.',
            {timeout: 30_000}
        );
        await expect(panel.previewValue(preview, 'Full')).toContainText('Alex Author');
        await expect(panel.previewValue(preview, 'Full')).toContainText('Zoe Zephyr');
        await expect(panel.previewValue(preview, 'Full')).toContainText('(Author)');
        await panel.closePanel(preview);

        // Ordering mode (Rule 6): Preview and Add Contributor give way to
        // Cancel, the button relabels "Save Order", the rows carry the
        // named arrows; move the second contributor up and save.
        await panel.orderButton().click();
        await expect(panel.saveOrderButton()).toBeVisible({timeout: 30_000});
        await expect(panel.cancelOrderButton()).toBeVisible();
        await expect(panel.previewButton()).toHaveCount(0);
        await expect(panel.addButton()).toHaveCount(0);
        // Content-verified reorder (see ContributorPages.makeFirst): each
        // bounded attempt (re-)enters ordering, redoes the move, saves with
        // a freshly armed response wait, and passes only when the panel —
        // re-rendered from the response — shows the new order (the remount
        // race can otherwise persist the OLD order: response ok, content
        // wrong). Repeated saveOrder POSTs are harmless.
        await expect(async () => {
            if (!(await panel.saveOrderButton().isVisible())) {
                await panel.orderButton().click({timeout: 2_000});
            }
            await panel
                .row('Zoe Zephyr')
                .getByRole('button', {name: 'Increase position of Zoe Zephyr'})
                .click({timeout: 2_000});
            await expect(panel.rows().first()).toContainText('Zoe Zephyr', {
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
            await panel.saveOrderButton().click({timeout: 2_000});
            await orderSaved;
            // The success handler re-renders the rows from the response —
            // this verifies the PERSISTED order, not the client echo.
            await expect(panel.rows().first()).toContainText('Zoe Zephyr', {
                timeout: 5_000,
            });
        }).toPass({intervals: [1_000, 2_000], timeout: 120_000});

        // Reload: the order holds, and "Abbreviated" now names the other
        // family name.
        panel = await openContributors(page, JOURNAL, submissionId);
        await expect(panel.rows().first()).toContainText('Zoe Zephyr', {
            timeout: 30_000,
        });
        await expect(panel.rows().nth(1)).toContainText('Alex Author');
        preview = await panel.openPreview();
        await expect(panel.previewValue(preview, 'Abbreviated')).toHaveText(
            'Zephyr et al.',
            {timeout: 30_000}
        );
        await panel.closePanel(preview);

        // Order again, move a row, Cancel — the saved order is back.
        await panel.orderButton().click();
        await panel
            .row('Alex Author')
            .getByRole('button', {name: 'Increase position of Alex Author'})
            .click();
        await expect(panel.rows().first()).toContainText('Alex Author');
        await panel.cancelOrderButton().click();
        await expect(panel.rows().first()).toContainText('Zoe Zephyr', {
            timeout: 30_000,
        });
        await expect(panel.orderButton()).toBeVisible();
    });

    test('S3: move the primary contact', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        const panel = await openContributors(page, JOURNAL, submissionId);

        // A second contributor; the submitting author's row carries the
        // badge while the other row offers "Set Primary Contact".
        const dialog = await panel.openAdd();
        await panel.fillPerson(dialog, {
            given: 'Noa',
            family: 'Petrova',
            email: `${tag}n@mail.test`,
            country: 'Canada',
        });
        await panel.tickRole(dialog, 'Author');
        await panel.savePanel(dialog);
        await expect(panel.badge('Alex Author', 'Primary Contact')).toBeVisible({
            timeout: 30_000,
        });
        await expect(panel.setPrimaryContactButton('Alex Author')).toHaveCount(0);
        await expect(panel.setPrimaryContactButton('Noa Petrova')).toBeVisible();

        // The badge moves at once, with no confirmation (Rule 10) — and
        // exactly one contributor holds it at a time, in both directions.
        await panel.setPrimaryContact('Noa Petrova');
        await expect(panel.badge('Noa Petrova', 'Primary Contact')).toBeVisible({
            timeout: 30_000,
        });
        await expect(panel.setPrimaryContactButton('Noa Petrova')).toHaveCount(0);
        await expect(panel.badge('Alex Author', 'Primary Contact')).toHaveCount(0);
        await expect(panel.setPrimaryContactButton('Alex Author')).toBeVisible();

        await panel.setPrimaryContact('Alex Author');
        await expect(panel.badge('Alex Author', 'Primary Contact')).toBeVisible({
            timeout: 30_000,
        });
        await expect(panel.badge('Noa Petrova', 'Primary Contact')).toHaveCount(0);
        // The delete-the-primary-contact aftermath is A2's open question —
        // deliberately not exercised (see the file header).
    });

    test('S4: record affiliations, typed with per-language names', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s4', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag, {bilingual: true});
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
        });
        const instName = `Institw${tag}`;

        const page = await (await asUser(manager)).newPage();
        await stubRegistrySearch(page);
        const panel = await openContributors(page, tag, submissionId);

        // The field's guidance, then the typed-entry path: type the name,
        // pick the typed text itself, press "Add" (which exists only after
        // the pick has filled the primary-locale name).
        let dialog = await panel.openEdit('Ada Author');
        await expect(
            panel
                .affiliationsField(dialog)
                .getByText('Enter the full name of the institution below')
        ).toBeVisible({timeout: 30_000});
        await panel.typeAndPickTypedInstitution(dialog, instName);
        await expect(panel.affiliationAddButton(dialog)).toBeEnabled({timeout: 30_000});
        await panel.affiliationAddButton(dialog).click();
        // Seeded contributors carry no country; fill the required field so
        // the later save is not refused client-side.
        await panel.fillPerson(dialog, {country: 'Canada'});

        // The typed entry joins the list with its completeness status: the
        // journal has two submission languages and only English is filled.
        const row = panel.affiliationRow(dialog, instName);
        await expect(row).toBeVisible({timeout: 30_000});
        await expect(row).toContainText('1 of 2 languages completed');

        // "Edit institution name" opens one name box per language; filling
        // the second completes the translations.
        await panel.openAffiliationAction(dialog, instName, 'Edit institution name');
        const nameBoxes = panel.affiliationRow(dialog, instName).locator('input[name="name"]');
        await expect(nameBoxes).toHaveCount(2, {timeout: 30_000});
        await expect(nameBoxes.first()).toHaveValue(instName);
        await nameBoxes.nth(1).fill(`${instName}Fr`);

        // Save the contributor; reopening shows the institution persisted
        // with every translation available.
        await panel.savePanel(dialog);
        dialog = await panel.openEdit('Ada Author');
        await expect(panel.affiliationRow(dialog, instName)).toBeVisible({
            timeout: 30_000,
        });
        await expect(panel.affiliationRow(dialog, instName)).toContainText(
            'All translations available'
        );

        // "Remove institution" asks "Are you sure?" with the named
        // warning; Yes removes it, and a save persists the removal.
        await panel.openAffiliationAction(dialog, instName, 'Remove institution');
        const confirm = panel.affiliationDeleteDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await expect(confirm).toContainText('Are you sure?');
        await expect(confirm).toContainText(`The affiliation ${instName}`);
        await confirm.getByRole('button', {name: 'Yes', exact: true}).click();
        await expect(panel.affiliationRow(dialog, instName)).toHaveCount(0, {
            timeout: 30_000,
        });
        await panel.savePanel(dialog);
        dialog = await panel.openEdit('Ada Author');
        await expect(
            panel.affiliationsField(dialog).getByText('Enter the full name')
        ).toBeVisible({timeout: 30_000});
        await expect(panel.affiliationRow(dialog, instName)).toHaveCount(0);
    });

    test('S5: manage the journal\'s contributor roles', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s5', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
        });
        const roleName = 'Handling Editor';

        const page = await (await asUser(manager)).newPage();
        const roles = new ContributorRolesScreen(page, tag);
        const panel = new ContributorsPanel(page);
        const pub = new PublicationScreen(page, tag);

        // The journal starts with Author (AUTHOR) and Translator
        // (TRANSLATOR) — Rule 11.
        await roles.goto();
        await expect(roles.roleRow('AUTHOR')).toContainText('Author', {
            timeout: 30_000,
        });
        await expect(roles.roleRow('TRANSLATOR')).toContainText('Translator');

        // Add a role with identifier EDITOR; the save confirms and the row
        // appears (Rule 12).
        await roles.addRole({identifier: 'EDITOR', names: {en: roleName}});
        await expect(
            page.locator(`[role="status"]:has-text("Contributor role saved")`)
        ).toBeVisible({timeout: 30_000});
        await expect(roles.roleRow(roleName)).toContainText('EDITOR');

        // Tick the new role on the submission's contributor — its badge
        // joins the row.
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Contributors');
        let dialog = await panel.openEdit('Ada Author');
        await panel.tickRole(dialog, roleName);
        // Seeded contributors carry no country; fill the required field so
        // the save is not refused client-side.
        await panel.fillPerson(dialog, {country: 'Canada'});
        await panel.savePanel(dialog);
        await expect(panel.badge('Ada Author', roleName)).toBeVisible({
            timeout: 30_000,
        });

        // Deleting the in-use role is refused after the type-to-confirm
        // (Rule 13); OK returns to the list with the role still there.
        await roles.goto();
        await roles.openRoleAction(roleName, 'Delete Role');
        let confirmDialog = roles.typeToConfirmDialog();
        await expect(confirmDialog).toBeVisible({timeout: 30_000});
        await confirmDialog.getByRole('textbox').fill('EDITOR');
        await roles.confirmDeleteButton(confirmDialog).click();
        let error = roles.errorDialog();
        await expect(error).toBeVisible({timeout: 30_000});
        await expect(error).toContainText(
            'One or more contributors are using this role. Change the role to another before delete.'
        );
        await error.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(error).toHaveCount(0, {timeout: 30_000});
        await expect(roles.roleRow(roleName)).toBeVisible();

        // Untick the role on the contributor, then delete it: the confirm
        // button enables only on an exact identifier match, and the "Role
        // Deleted" dialog confirms.
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Contributors');
        dialog = await panel.openEdit('Ada Author');
        await panel.untickRole(dialog, roleName);
        await panel.savePanel(dialog);

        await roles.goto();
        await roles.openRoleAction(roleName, 'Delete Role');
        confirmDialog = roles.typeToConfirmDialog();
        await expect(confirmDialog).toBeVisible({timeout: 30_000});
        await expect(roles.confirmDeleteButton(confirmDialog)).toBeDisabled();
        await confirmDialog.getByRole('textbox').fill('EDIT');
        await expect(roles.confirmDeleteButton(confirmDialog)).toBeDisabled();
        await confirmDialog.getByRole('textbox').fill('EDITOR');
        await expect(roles.confirmDeleteButton(confirmDialog)).toBeEnabled();
        await roles.confirmDeleteButton(confirmDialog).click();
        const deletedDialog = roles.roleDeletedDialog();
        await expect(deletedDialog).toBeVisible({timeout: 30_000});
        await expect(deletedDialog).toContainText(
            '"EDITOR" has been successfully deleted.'
        );
        await deletedDialog
            .getByRole('button', {name: 'Back to Contributor Roles', exact: true})
            .click();
        await expect(roles.roleRow(roleName)).toHaveCount(0, {timeout: 30_000});

        // Free the Author role (the contributor must hold another), then
        // deleting the journal's only AUTHOR-identifier role is refused.
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Contributors');
        dialog = await panel.openEdit('Ada Author');
        await panel.tickRole(dialog, 'Translator');
        await panel.untickRole(dialog, 'Author');
        await panel.savePanel(dialog);
        await expect(panel.badge('Ada Author', 'Translator')).toBeVisible({
            timeout: 30_000,
        });

        await roles.goto();
        await roles.openRoleAction('AUTHOR', 'Delete Role');
        confirmDialog = roles.typeToConfirmDialog();
        await expect(confirmDialog).toBeVisible({timeout: 30_000});
        await confirmDialog.getByRole('textbox').fill('AUTHOR');
        await roles.confirmDeleteButton(confirmDialog).click();
        error = roles.errorDialog();
        await expect(error).toBeVisible({timeout: 30_000});
        await expect(error).toContainText('Last AUTHOR role cannot be deleted.');
        await error.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(roles.roleRow('AUTHOR')).toBeVisible({timeout: 30_000});
    });

    test('S6: readers see the contributors', {tag: '@smoke'}, async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s6', testInfo);
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            published: true,
            issue: {volume: 1, number: 2, year: 2014},
        });
        const instName = `Univw${tag}`;
        const bioText = `Bio statement ${tag}`;

        // The manager equips the first contributor with a typed
        // affiliation, a Bio Statement and a second role, and adds a
        // plain second contributor (the published version stays editable).
        const managerPage = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(managerPage);
        const panel = await openContributors(managerPage, JOURNAL, submissionId);
        const pub = new PublicationScreen(managerPage, JOURNAL);

        let dialog = await panel.openEdit('Alex Author');
        await panel.typeAndPickTypedInstitution(dialog, instName);
        await panel.affiliationAddButton(dialog).click();
        await expect(panel.affiliationRow(dialog, instName)).toBeVisible({
            timeout: 30_000,
        });
        await pub.setRichText('contributor-biography-control-en', `<p>${bioText}</p>`);
        await panel.tickRole(dialog, 'Translator');
        // Seeded contributors carry no country; fill the required field so
        // the save is not refused client-side.
        await panel.fillPerson(dialog, {country: 'Canada'});
        await panel.savePanel(dialog);
        await expect(panel.badge('Alex Author', 'Translator')).toBeVisible({
            timeout: 30_000,
        });

        dialog = await panel.openAdd();
        await panel.fillPerson(dialog, {
            given: 'Noa',
            family: 'Secondi',
            email: `${tag}n@mail.test`,
            country: 'Canada',
        });
        await panel.tickRole(dialog, 'Author');
        await panel.savePanel(dialog);
        await expect(panel.row('Noa Secondi')).toBeVisible({timeout: 30_000});

        // Pin the list order (Alex first) — the panel-added contributor
        // ties the auto-created author at sequence 0 (see the file header).
        await panel.makeFirst('Alex Author');

        // The anonymous reader's landing page credits both in list order:
        // names, the affiliation name and the role names (Rule 14).
        await page.goto(`/index.php/${JOURNAL}/article/view/${submissionId}`);
        const authors = page.locator('.item.authors');
        await expect(authors).toBeVisible({timeout: 30_000});
        const authorItems = authors.locator('ul.authors > li');
        await expect(authorItems.first()).toContainText('Alex Author');
        await expect(authorItems.first().locator('.affiliation')).toContainText(
            instName
        );
        await expect(
            authorItems.first().locator('.contributor_roles')
        ).toContainText('Translator');
        await expect(authorItems.nth(1)).toContainText('Noa Secondi');
        await expect(
            authorItems.nth(1).locator('.contributor_roles')
        ).toContainText('Author');

        // No reader page marks any author as the contact (Rule 10) — the
        // rendered authors block above is the positive control.
        await expect(page.getByText('Primary Contact')).toHaveCount(0);

        // The one contributor with a Bio Statement gets the "Author
        // Biography" section: "{name}, {affiliation}" above the statement.
        const bios = page.locator('.item.author_bios');
        await expect(
            bios.getByRole('heading', {name: 'Author Biography'})
        ).toBeVisible();
        await expect(bios.locator('li .label').first()).toContainText(
            `Alex Author, ${instName}`
        );
        await expect(bios).toContainText(bioText);

        // The issue's table of contents shows the author line in the
        // "Full" format — names with roles in parentheses (Rule 15).
        await page.goto(`/index.php/${JOURNAL}/issue/current`);
        const summary = page
            .locator('.obj_article_summary')
            .filter({hasText: `Submission ${tag}`});
        await expect(summary).toBeVisible({timeout: 30_000});
        const authorLine = summary.locator('.meta .authors');
        await expect(authorLine).toContainText('Alex Author (');
        await expect(authorLine).toContainText('Translator');
        await expect(authorLine).toContainText('Noa Secondi (Author)');
    });

    test('S7: keep a contributor out of publication lists', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            published: true,
        });

        const managerPage = await (await asUser('manager.maya')).newPage();
        const panel = await openContributors(managerPage, JOURNAL, submissionId);

        // A second contributor, then untick "Publication Lists" on them.
        let dialog = await panel.openAdd();
        await panel.fillPerson(dialog, {
            given: 'Bela',
            family: 'Brant',
            email: `${tag}b@mail.test`,
            country: 'Canada',
        });
        await panel.tickRole(dialog, 'Author');
        await panel.savePanel(dialog);
        await expect(panel.row('Bela Brant')).toBeVisible({timeout: 30_000});

        dialog = await panel.openEdit('Bela Brant');
        await dialog
            .getByRole('checkbox', {
                name: 'Include this contributor when identifying authors in lists of publications.',
            })
            .uncheck();
        await panel.savePanel(dialog);

        // Preview: the "Publication Lists" format omits them while "Full"
        // keeps them (Rules 7–8; "Full" containing the name is the
        // positive control bounding the absence read).
        const preview = await panel.openPreview();
        await expect(panel.previewValue(preview, 'Full')).toContainText('Bela Brant', {
            timeout: 30_000,
        });
        await expect(panel.previewValue(preview, 'Full')).toContainText('Alex Author');
        await expect(
            panel.previewValue(preview, 'Publication Lists')
        ).toContainText('Alex Author');
        await expect(
            panel.previewValue(preview, 'Publication Lists')
        ).not.toContainText('Bela Brant');
        await panel.closePanel(preview);

        // The landing page still credits both (Rule 8's clean half; the
        // OJS listing behavior is A3's — see the file header).
        await page.goto(`/index.php/${JOURNAL}/article/view/${submissionId}`);
        const authors = page.locator('.item.authors');
        await expect(authors).toBeVisible({timeout: 30_000});
        await expect(authors).toContainText('Alex Author');
        await expect(authors).toContainText('Bela Brant');
    });

    test('S8: require competing interests', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s8', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
        });
        const ciText = `Competing interest ${tag}`;

        const page = await (await asUser(manager)).newPage();
        const pub = new PublicationScreen(page, tag);
        const panel = new ContributorsPanel(page);

        // Tick the requirement on the workflow settings' Metadata screen.
        const openMetadataSettings = async () => {
            await page.goto(`/index.php/${tag}/management/settings/workflow`);
            await page.locator('#metadata-button').click();
            await expect(
                page.getByRole('checkbox', {
                    name: /Require submitting Authors to file a Competing Interest/,
                })
            ).toBeVisible({timeout: 30_000});
        };
        const saveMetadataSettings = async () => {
            const saved = waitForContextSettingsSave(page);
            await page
                .locator('form')
                .filter({
                    has: page.getByRole('checkbox', {
                        name: /Require submitting Authors to file a Competing Interest/,
                    }),
                })
                .getByRole('button', {name: 'Save', exact: true})
                .click();
            await saved;
        };
        await openMetadataSettings();
        await page
            .getByRole('checkbox', {
                name: /Require submitting Authors to file a Competing Interest/,
            })
            .check();
        await saveMetadataSettings();

        // Editing any contributor now shows the required field; saving it
        // empty is refused on the form (Fields & validation's shape).
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Contributors');
        let dialog = await panel.openEdit('Ada Author');
        // The field's own guidance is its stable marker (the label text
        // carries the required marker inline).
        const ciGuidance = 'Please disclose any competing interests';
        await expect(dialog.getByText(ciGuidance)).toBeVisible({timeout: 30_000});
        // Pin the only other gap shut so the refusal is exactly one error.
        await panel.fillPerson(dialog, {country: 'Canada'});
        await dialog.getByRole('button', {name: 'Save', exact: true}).click();
        await expect(dialog.getByText('Please correct one error.')).toBeVisible({
            timeout: 30_000,
        });
        await expect(dialog.getByText('This field is required.').first()).toBeVisible();

        // Filling it saves; the statement persists.
        await pub.setRichText(
            'contributor-competingInterests-control-en',
            `<p>${ciText}</p>`
        );
        await panel.savePanel(dialog);
        dialog = await panel.openEdit('Ada Author');
        expect(
            await pub.richTextContent('contributor-competingInterests-control-en')
        ).toContain(ciText);
        await panel.closePanel(dialog);

        // Unticking the setting removes the field (the sibling Bio
        // Statement stays — the positive control) …
        await openMetadataSettings();
        await page
            .getByRole('checkbox', {
                name: /Require submitting Authors to file a Competing Interest/,
            })
            .uncheck();
        await saveMetadataSettings();
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Contributors');
        dialog = await panel.openEdit('Ada Author');
        await expect(dialog.getByText('Bio Statement', {exact: false})).toBeVisible({
            timeout: 30_000,
        });
        await expect(dialog.getByText(ciGuidance)).toHaveCount(0);
        await panel.closePanel(dialog);

        // … and re-ticking brings the saved statement back intact
        // (Settings that modify behavior).
        await openMetadataSettings();
        await page
            .getByRole('checkbox', {
                name: /Require submitting Authors to file a Competing Interest/,
            })
            .check();
        await saveMetadataSettings();
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Contributors');
        dialog = await panel.openEdit('Ada Author');
        await expect(dialog.getByText(ciGuidance)).toBeVisible({timeout: 30_000});
        expect(
            await pub.richTextContent('contributor-competingInterests-control-en')
        ).toContain(ciText);
    });

    test('OJS-A: the author\'s workflow contributor list is read-only', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('oa', testInfo);
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        // Positive control (the editable side): the manager's view offers
        // Order, Add Contributor and the row actions.
        const managerPage = await (await asUser('manager.maya')).newPage();
        const managerPanel = await openContributors(managerPage, JOURNAL, submissionId);
        await expect(managerPanel.row('Alex Author')).toBeVisible({timeout: 30_000});
        await expect(managerPanel.orderButton()).toBeVisible();
        await expect(managerPanel.addButton()).toBeVisible();
        await expect(managerPanel.previewButton()).toBeVisible();
        await expect(
            managerPanel.row('Alex Author').getByRole('button', {name: 'Edit', exact: true})
        ).toBeVisible();
        await expect(
            managerPanel
                .row('Alex Author')
                .getByRole('button', {name: 'Delete', exact: true})
        ).toBeVisible();

        // The submitting author sees the same list read-only on a journal
        // (Rule 9; the editable-author case is OPS-only — spec OPS1): the
        // rows and "Preview" remain, every other control absent entirely.
        const authorPage = await (await asUser('author.alex')).newPage();
        const authorPanel = await openContributors(authorPage, JOURNAL, submissionId, {
            author: true,
        });
        await expect(authorPanel.row('Alex Author')).toBeVisible({timeout: 30_000});
        await expect(authorPanel.badge('Alex Author', 'Author')).toBeVisible();
        await expect(authorPanel.previewButton()).toBeVisible();
        await expect(authorPanel.orderButton()).toHaveCount(0);
        await expect(authorPanel.addButton()).toHaveCount(0);
        await expect(
            authorPanel.row('Alex Author').getByRole('button', {name: 'Edit', exact: true})
        ).toHaveCount(0);
        await expect(
            authorPanel
                .row('Alex Author')
                .getByRole('button', {name: 'Delete', exact: true})
        ).toHaveCount(0);
        await expect(
            authorPanel.setPrimaryContactButton('Alex Author')
        ).toHaveCount(0);
    });
});
