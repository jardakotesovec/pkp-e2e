// @ts-check
/**
 * @file playwright/tests/U41-contributors-and-affiliations.spec.js
 *
 * Contributors & affiliations — OJS suite, one test per canonical scenario
 * the spec runs on OJS (S1–S9 common; S11 {OJS OMP}; scenario 10 is OMP's,
 * in its tree).
 * Spec: docs/specs/U41-contributors-and-affiliations.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 🐞
 * (nothing asserts a row's affiliation line), A2 ❓ (S3 asserts only the
 * scenario's own sentences after the primary contact's deletion: the
 * remaining row's "Set Primary Contact", the publish window's "All
 * publication requirements have been met." and its Close), A3 🐞 (S7
 * asserts only the Preview rows and the landing page; no journal listing
 * is read for the unticked contributor), A4 ❓ (no test types a ROR ID),
 * A5 🐞 (every affiliation takes the typed-name path; the browser-side
 * registry query is stubbed to an empty result set), A6 ❓ (S9 asserts
 * only the scenario's own sentence, the badge's absence on the Author's
 * list), A7 🐞 (S4 asserts only the field's own message, never the foot's
 * summary), A8 ❓, A9 🐞, A10 🐞, A11 ❓ (no typed-but-unpicked save, no
 * accessibility read, no registry-error dialog), A12 🐞 (the delete-role
 * confirm button is reached as the non-Cancel button; its text is never
 * asserted), A13 ❓ (S5 runs on a single-language journal), A14 🐞 (no
 * test reduces a journal to one role), A16 ❓ (the seeded contributor's
 * Country is filled before each of its edits), A17 ❓, A18 ❓ (S1's
 * Anonymous save fills Email and Country), OMP1, OMP2, OPS1 and OPS2
 * (press- and preprint-only, in those trees). The spec's Coverage section
 * records everything else left out.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only for settings (S4, S5, S8 and S11 run on scratch journals
 * with throwaway users; S6 publishes into the seeded back issue through
 * the sanctioned issue overlay). Mailbox silences (S1, S3) are read in the
 * shared Mailpit scoped to a throwaway submitter's address the test
 * created on a scratch context (users are created there and nowhere
 * else) and bounded by a mail the test itself sends the same way, the
 * manager's "Notify" on a spare account's own submission (A8, M4); the
 * Activity Log silences are counts before and after, bounded by the
 * test's own "Set Primary Contact" line (the one write that logs). Every
 * absence is read with a settled locator and paired with a positive
 * control taken the same way (M6). Waits are event-based (API responses,
 * web-first assertions, jQuery idle for legacy grids) — no hard sleeps.
 * Everything runs in the parallel `ojs` project.
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
const {SubmissionWizardPage} = require('../pages/SubmissionWizardPage.js');
const {
    ReviewerAssignmentsPage,
    ReviewWizardPage,
} = require('../../../../shared/playwright/pages/ReviewerPages.js');

const JOURNAL = 'publicknowledge';
const NOTIFY_SUBJECT = 'Discussion (Submission)';
const LOG_LINE = 'Submission metadata updated';
const MANAGER_NAME = 'Maya Manager';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u41${scenario}w${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

/**
 * Seed a scratch journal with one throwaway manager and one throwaway
 * author (plus, with `spare`, a third author-role account the mailbox
 * controls are addressed to, and with `reviewer`, an external reviewer);
 * returns their usernames.
 *
 * @param {{bilingual?: boolean, spare?: boolean, reviewer?: boolean, review?: object}} options
 */
async function seedJournal(ojsApi, tag, {bilingual = false, spare = false, reviewer = false, review} = {}) {
    const context = bilingual
        ? {
              primaryLocale: 'en',
              supportedLocales: ['en', 'fr_CA'],
              supportedSubmissionLocales: ['en', 'fr_CA'],
          }
        : undefined;
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
        ...(context ? {context} : {}),
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

/** Open the workflow's Contributors page and return the panel POM. */
async function openContributors(page, contextPath, submissionId, {author = false} = {}) {
    const pub = new PublicationScreen(page, contextPath);
    await pub.gotoWorkflow(submissionId, {author});
    await pub.openEntry('Contributors');
    return new ContributorsPanel(page);
}

/**
 * Open the Activity Log, wait for its grid to hold a row (the bound every
 * count below rides on: a seeded submission always carries its own
 * lines), and return the "Submission metadata updated" rows attributed
 * to the given person plus a closer.
 */
async function metadataUpdatedLines(pub, byName) {
    const log = await pub.openActivityLog();
    await expect(log.locator('tr.gridRow').first()).toBeVisible({timeout: 30_000});
    const rows = log
        .getByRole('row')
        .filter({hasText: LOG_LINE})
        .filter({hasText: byName});
    const close = async () => {
        await log.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(log).toBeHidden({timeout: 30_000});
    };
    return {rows, close};
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

/** Delete a row through the "Delete Contributor" dialog, bounded by the API answering. */
async function deleteContributor(page, panel, rowText) {
    await panel.row(rowText).getByRole('button', {name: 'Delete', exact: true}).click();
    const confirm = panel.deleteDialog();
    await expect(confirm).toBeVisible({timeout: 30_000});
    const deleted = page.waitForResponse(
        (r) =>
            r.url().includes('/contributors') &&
            r.request().method() === 'POST' &&
            r.ok(),
        {timeout: 30_000}
    );
    await confirm.getByRole('button', {name: 'Delete Contributor', exact: true}).click();
    await deleted;
    await expect(panel.row(rowText)).toHaveCount(0, {timeout: 30_000});
}

test.describe('contributors and affiliations', () => {
    test('S1: maintain the contributor list', {tag: '@smoke'}, async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(360_000);
        const tag = makeTag('s1', testInfo);
        const controlTag = makeTag('s1c', testInfo);
        // The throwaway submitter (the mailbox the silence is read in) and
        // the spare (the control mail's recipient) live on a scratch
        // context and each submit to the seeded journal (footnote s1).
        const {author, spare} = await seedJournal(ojsApi, tag, {spare: true});
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
        ]);

        const page = await (await asUser('manager.maya')).newPage();
        const pub = new PublicationScreen(page, JOURNAL);
        const panel = await openContributors(page, JOURNAL, submissionId);

        // "Contributors": the entry sits second, right after "Title &
        // Abstract"; the page is headed "Contributors" (openEntry waits on
        // it) with "Order", "Preview" and "Add Contributor" above the rows;
        // the submitting author is listed with an "Author" badge, the
        // "Primary Contact" badge, "Edit" and "Delete" (Rules 2, 3, 10).
        await expect(
            page.getByRole('link', {name: /^(Title & Abstract|Contributors)$/})
        ).toHaveText(['Title & Abstract', 'Contributors']);
        await expect(panel.orderButton()).toBeVisible();
        await expect(panel.previewButton()).toBeVisible();
        await expect(panel.addButton()).toBeVisible();
        await expect(panel.row('Ada Author')).toBeVisible({timeout: 30_000});
        await expect(panel.badge('Ada Author', 'Author')).toBeVisible();
        await expect(panel.badge('Ada Author', 'Primary Contact')).toBeVisible();
        await expect(panel.row('Ada Author').getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
        await expect(panel.row('Ada Author').getByRole('button', {name: 'Delete', exact: true})).toBeVisible();

        // An empty save: the panel opens on "Person" with the type-switch
        // guidance; Save with nothing filled is refused in place: "This
        // field is required." under Given Name, Email, Country and
        // Contributor Roles, "Please correct 4 errors." with "Jump to next
        // error", and Save disabled (Fields).
        let dialog = await panel.openAdd();
        await expect(dialog.getByText('Selecting a contributor type will determine')).toBeVisible();
        await expect(panel.typeRadio(dialog, 'Person')).toBeChecked();
        await panel.saveRefused(dialog, panel.errorSummary(dialog, 4));
        await expect(dialog.getByRole('button', {name: 'Jump to next error'})).toBeVisible();
        const requiredUnder = async (field) => {
            await expect(panel.fieldError(field)).toBeVisible();
            await expect(panel.fieldError(field)).toContainText('This field is required.');
        };
        await requiredUnder(panel.fieldByName(dialog, 'givenName-en'));
        await requiredUnder(panel.fieldByName(dialog, 'email'));
        await requiredUnder(panel.fieldByName(dialog, 'country'));
        await requiredUnder(panel.rolesField(dialog));
        await expect(panel.saveButton(dialog)).toBeDisabled();
        // Editing the Given Name clears its own message. The spec's "Save
        // stays disabled until one of them is edited" is T-ojs-1's: on this
        // build Save stays disabled while any flagged field is still empty
        // (run 3 of 2026-09-16, three errors left and Save disabled), so
        // the re-enable is read only below, once every flagged field is
        // filled, and the sentence is neither asserted nor contradicted here.
        await panel.fillPerson(dialog, {given: 'Alan'});
        await expect(panel.fieldError(panel.fieldByName(dialog, 'givenName-en'))).toHaveCount(0);

        // A bad Email and Homepage URL: the save is refused, the panel
        // stays open with an error under Email and under Homepage URL (the
        // body quotes no message text, so only the refusal is asserted).
        await panel.fillPerson(dialog, {email: 'not-an-address', country: 'Canada'});
        await panel.fillUrl(dialog, 'not a web address');
        await panel.tickRole(dialog, 'Author');
        await panel.saveRefused(dialog, panel.fieldError(panel.fieldByName(dialog, 'email')));
        await expect(panel.fieldError(panel.fieldByName(dialog, 'url'))).toBeVisible();
        await expect(panel.saveButton(dialog)).toBeVisible();

        // The person: a good Email and an emptied Homepage URL save; the
        // panel closes and the row shows "Alan" with an "Author" badge.
        await panel.fillPerson(dialog, {email: `${tag}alan@mail.test`});
        await panel.fillUrl(dialog, '');
        await panel.savePanel(dialog);
        await expect(panel.row('Alan')).toBeVisible({timeout: 30_000});
        await expect(panel.badge('Alan', 'Author')).toBeVisible();

        // The type switch: a Given Name typed, then "Organization or
        // group": the name fields swap to "Organization Name"; saved, the
        // row shows "Probe Org"; its "Edit" switched to "Person" shows an
        // empty Given Name (the other type's entry discarded on save, as
        // the guidance warns); back on "Organization or group", Save.
        dialog = await panel.openAdd();
        await panel.fillPerson(dialog, {given: 'Casey'});
        await panel.chooseType(dialog, 'Organization or group');
        await expect(panel.organizationNameInput(dialog)).toBeVisible({timeout: 30_000});
        await expect(dialog.locator('input[name="givenName-en"]')).toHaveCount(0);
        await panel.organizationNameInput(dialog).fill('Probe Org');
        await panel.fillPerson(dialog, {email: `${tag}org@mail.test`, country: 'Canada'});
        await panel.tickRole(dialog, 'Author');
        await panel.savePanel(dialog);
        await expect(panel.row('Probe Org')).toBeVisible({timeout: 30_000});
        await expect(panel.badge('Probe Org', 'Author')).toBeVisible();
        dialog = await panel.openEdit('Probe Org');
        await expect(panel.organizationNameInput(dialog)).toHaveValue('Probe Org', {timeout: 30_000});
        await panel.chooseType(dialog, 'Person');
        await expect(dialog.locator('input[name="givenName-en"]')).toHaveValue('', {timeout: 30_000});
        await panel.chooseType(dialog, 'Organization or group');
        await expect(panel.organizationNameInput(dialog)).toHaveValue('Probe Org', {timeout: 30_000});
        await panel.savePanel(dialog);
        await expect(panel.row('Probe Org')).toBeVisible({timeout: 30_000});

        // Edit: the person's "Edit" opens prefilled; a Family Name typed
        // updates the row in place to "Alan Mwandenga" (Rule 4).
        dialog = await panel.openEdit('Alan');
        await expect(dialog.locator('input[name="givenName-en"]')).toHaveValue('Alan', {timeout: 30_000});
        await panel.fillPerson(dialog, {family: 'Mwandenga'});
        await panel.savePanel(dialog);
        await expect(panel.row('Alan Mwandenga')).toBeVisible({timeout: 30_000});

        // An Anonymous contributor: no name fields, ROR ID, Homepage URL,
        // Bio Statement or Affiliations; only Email, Country, Contributor
        // Roles, CRediT roles and Publication Lists (Fields). Saved, the
        // row is titled "Anonymous" with an "Author" badge, and Preview's
        // "Full" row ends "; Anonymous (Author)" (Rules 3, 7).
        dialog = await panel.openAdd();
        await panel.chooseType(dialog, 'Anonymous');
        await expect(panel.control(dialog, 'email')).toBeVisible({timeout: 30_000});
        await expect(panel.control(dialog, 'country')).toBeVisible();
        await expect(panel.rolesField(dialog)).toBeVisible();
        await expect(panel.creditRolesField(dialog)).toBeVisible();
        await expect(panel.publicationListsBox(dialog)).toBeVisible();
        for (const name of ['givenName-en', 'familyName-en', 'preferredPublicName-en', 'organizationName-en', 'rorId', 'url']) {
            await expect(panel.control(dialog, name)).toHaveCount(0);
        }
        await expect(panel.affiliationsField(dialog)).toHaveCount(0);
        await expect(dialog.locator('[id^="contributor-biography"]')).toHaveCount(0);
        await panel.fillPerson(dialog, {email: `${tag}anon@mail.test`, country: 'Canada'});
        await panel.tickRole(dialog, 'Author');
        await panel.savePanel(dialog);
        await expect(panel.row('Anonymous')).toBeVisible({timeout: 30_000});
        await expect(panel.badge('Anonymous', 'Author')).toBeVisible();
        let preview = await panel.openPreview();
        await expect(panel.previewValue(preview, 'Full')).toHaveText(/; Anonymous \(Author\)$/, {
            timeout: 30_000,
        });
        await panel.closePanel(preview);

        // Delete: the "Delete Contributor" dialog names the row; "Cancel"
        // keeps it, "Delete Contributor" removes it; the Anonymous row's
        // dialog asks to remove "Anonymous" (Rules 3, 5).
        await panel.row('Probe Org').getByRole('button', {name: 'Delete', exact: true}).click();
        let confirm = panel.deleteDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await expect(confirm).toContainText(
            'Are you sure you want to remove Probe Org as a contributor? This action can not be undone.'
        );
        await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(confirm).toHaveCount(0, {timeout: 30_000});
        await expect(panel.row('Probe Org')).toBeVisible();
        await deleteContributor(page, panel, 'Probe Org');
        await panel.row('Anonymous').getByRole('button', {name: 'Delete', exact: true}).click();
        confirm = panel.deleteDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await expect(confirm).toContainText(
            'Are you sure you want to remove Anonymous as a contributor? This action can not be undone.'
        );
        await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(confirm).toHaveCount(0, {timeout: 30_000});
        await deleteContributor(page, panel, 'Anonymous');
        await expect(panel.row('Alan Mwandenga')).toBeVisible();
        await expect(panel.row('Ada Author')).toBeVisible();

        // Nothing else happens: the Activity Log has no new entry from the
        // adds, edits and deletes (Side effects) …
        let log = await metadataUpdatedLines(pub, MANAGER_NAME);
        await expect(log.rows).toHaveCount(0);
        await log.close();

        // Control: "Set Primary Contact" on this same submission writes one
        // "Submission metadata updated" entry (scenario 3's line).
        await panel.setPrimaryContact('Alan Mwandenga');
        await expect(panel.badge('Alan Mwandenga', 'Primary Contact')).toBeVisible({timeout: 30_000});
        log = await metadataUpdatedLines(pub, MANAGER_NAME);
        await expect(log.rows.first()).toBeVisible({timeout: 30_000});
        await expect(log.rows).toHaveCount(1);
        await log.close();

        // … and no email arrived in the mail catcher: the submitter's
        // address and the added contributors' addresses, read after the
        // control mail the test sends the same way (A8).
        await expectNoMailToSubmitter(page, pkpMail, {
            tag,
            controlSubmissionId: control.submissionId,
            author,
            spare,
        });
        expect(await pkpMail.count({to: `${tag}alan@mail.test`})).toBe(0);
        expect(await pkpMail.count({to: `${tag}anon@mail.test`})).toBe(0);
    });

    test('S2: reorder and preview the display formats', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s2', testInfo);
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(page);
        const pub = new PublicationScreen(page, JOURNAL);
        let panel = await openContributors(page, JOURNAL, submissionId);

        // A second contributor with a distinct family name.
        let dialog = await panel.openAdd();
        await panel.fillPerson(dialog, {
            given: 'Zoe',
            family: 'Zephyr',
            email: `${tag}z@mail.test`,
            country: 'Canada',
        });
        await panel.tickRole(dialog, 'Author');
        await panel.savePanel(dialog);
        await expect(panel.row('Zoe Zephyr')).toBeVisible({timeout: 30_000});

        // Control (before any "Save Order"): on a reload the list shows the
        // submitting author first and the added contributor second, and
        // Preview's "Abbreviated" names their family name (Rule 6).
        panel = await openContributors(page, JOURNAL, submissionId);
        await expect(panel.rows().first()).toContainText('Alex Author', {timeout: 30_000});
        await expect(panel.rows().nth(1)).toContainText('Zoe Zephyr');

        // Preview (Rule 7): "Abbreviated" is the first contributor's family
        // name plus "et al."; "Full" both names, each with "(Author)",
        // separated by a semicolon.
        let preview = await panel.openPreview();
        await expect(panel.previewValue(preview, 'Abbreviated')).toHaveText('Author et al.', {
            timeout: 30_000,
        });
        await expect(panel.previewValue(preview, 'Full')).toHaveText(
            'Alex Author (Author); Zoe Zephyr (Author)'
        );
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
        // The move is content-verified like the save above: an arrow press
        // issued while the list re-renders into ordering mode can be
        // swallowed (ci-triage flake watch, seen on the OPS twin; CI run
        // 34466942823, 2026-09-10), so each bounded attempt (re-)enters
        // ordering, waits for the row's own arrow and passes only when the
        // list shows the move. A repeat press on an already-first row is a
        // no-op.
        const alexUp = panel
            .row('Alex Author')
            .getByRole('button', {name: 'Increase position of Alex Author'});
        await expect(async () => {
            if (!(await panel.saveOrderButton().isVisible())) {
                await panel.orderButton().click({timeout: 2_000});
            }
            await expect(alexUp).toBeVisible({timeout: 5_000});
            await alexUp.click({timeout: 2_000});
            await expect(panel.rows().first()).toContainText('Alex Author', {
                timeout: 2_000,
            });
        }).toPass({intervals: [1_000, 2_000], timeout: 60_000});
        await panel.cancelOrderButton().click();
        await expect(panel.rows().first()).toContainText('Zoe Zephyr', {
            timeout: 30_000,
        });
        await expect(panel.orderButton()).toBeVisible();

        // A new version: the first contributor gets a typed affiliation
        // "Probe Institute"; "Create New Version" confirmed untouched
        // copies the list: the same rows in the saved order, each with its
        // "Author" badge, the "Primary Contact" badge on the submitting
        // author's row, and the affiliation under "Affiliations" in the
        // first contributor's "Edit" (Rule 1; Fields). The copy is opened
        // by its publication id: it carries its source's name.
        dialog = await panel.openEdit('Zoe Zephyr');
        await panel.typeAndPickTypedInstitution(dialog, 'Probe Institute');
        await expect(panel.affiliationAddButton(dialog)).toBeEnabled({timeout: 30_000});
        await panel.affiliationAddButton(dialog).click();
        await expect(panel.affiliationRow(dialog, 'Probe Institute')).toBeVisible({timeout: 30_000});
        await panel.savePanel(dialog);
        const newPublicationId = await pub.createNewVersionUntouched();
        await pub.gotoVersionPage(submissionId, newPublicationId, 'contributors', 'Contributors');
        panel = new ContributorsPanel(page);
        await expect(panel.rows()).toHaveCount(2, {timeout: 30_000});
        await expect(panel.rows().first()).toContainText('Zoe Zephyr');
        await expect(panel.rows().nth(1)).toContainText('Alex Author');
        await expect(panel.badge('Zoe Zephyr', 'Author')).toBeVisible();
        await expect(panel.badge('Alex Author', 'Author')).toBeVisible();
        await expect(panel.badge('Alex Author', 'Primary Contact')).toBeVisible();
        await expect(panel.badge('Zoe Zephyr', 'Primary Contact')).toHaveCount(0);
        dialog = await panel.openEdit('Zoe Zephyr');
        await expect(panel.affiliationRow(dialog, 'Probe Institute')).toBeVisible({timeout: 30_000});
        await panel.closePanel(dialog);
    });

    test('S3: move the primary contact', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(360_000);
        const tag = makeTag('s3', testInfo);
        const controlTag = makeTag('s3c', testInfo);
        const {author, spare} = await seedJournal(ojsApi, tag, {spare: true});
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
        ]);

        const page = await (await asUser('manager.maya')).newPage();
        const pub = new PublicationScreen(page, JOURNAL);
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
        await expect(panel.badge('Ada Author', 'Primary Contact')).toBeVisible({
            timeout: 30_000,
        });
        await expect(panel.setPrimaryContactButton('Ada Author')).toHaveCount(0);
        await expect(panel.setPrimaryContactButton('Noa Petrova')).toBeVisible();

        // "Set Primary Contact": the badge moves at once, with no
        // confirmation (Rule 10) — the moved badge bounds the read that no
        // "Are you sure" window opened.
        await panel.setPrimaryContact('Noa Petrova');
        await expect(panel.badge('Noa Petrova', 'Primary Contact')).toBeVisible({
            timeout: 30_000,
        });
        await expect(panel.setPrimaryContactButton('Noa Petrova')).toHaveCount(0);
        await expect(panel.badge('Ada Author', 'Primary Contact')).toHaveCount(0);
        await expect(panel.setPrimaryContactButton('Ada Author')).toBeVisible();
        await expect(page.getByRole('dialog').filter({hasText: 'Are you sure'})).toHaveCount(0);

        // The log and the mailbox: one new "Submission metadata updated"
        // entry (Side effects); the mailbox is read at the end, bounded by
        // the control mail.
        let log = await metadataUpdatedLines(pub, MANAGER_NAME);
        await expect(log.rows.first()).toBeVisible({timeout: 30_000});
        await expect(log.rows).toHaveCount(1);
        await log.close();

        // Deleting the primary contact: the remaining row still shows only
        // "Set Primary Contact" (Rules 5, 10; A2's aftermath is not
        // asserted beyond the scenario's own sentence).
        await deleteContributor(page, panel, 'Noa Petrova');
        await expect(panel.setPrimaryContactButton('Ada Author')).toBeVisible({timeout: 30_000});
        await expect(panel.primaryContactBadges()).toHaveCount(0);
        // Control, first half: the delete wrote nothing — still the one
        // entry from the move (Side effects).
        log = await metadataUpdatedLines(pub, MANAGER_NAME);
        await expect(log.rows.first()).toBeVisible({timeout: 30_000});
        await expect(log.rows).toHaveCount(1);
        await log.close();

        // The publish dialog: "Schedule For Publication", past "Review
        // Publishing Details" (its required version details filled, its
        // "Confirm") to the final confirmation, "All publication
        // requirements have been met.", whose only other button is
        // "Publish"; backed out with "Close". Nothing is published.
        const publishPanel = await pub.openPublishPanel();
        await pub.fillVersionDetails(publishPanel);
        // The seeded journal's panel arrives on "Assign To Current/Back
        // Issue" with its Issue box empty and required, so the issueless
        // choice is the way past it (the publish helper's own path).
        await pub.awaitAssignmentPreselected(publishPanel);
        await publishPanel.getByRole('radio', {name: "Don't Assign To An Issue"}).check();
        await publishPanel.getByRole('button', {name: 'Confirm', exact: true}).click();
        const confirmation = page
            .getByRole('dialog')
            .filter({hasText: 'All publication requirements have been met.'})
            .last();
        await expect(confirmation).toBeVisible({timeout: 30_000});
        await expect(confirmation.getByRole('button', {name: 'Publish', exact: true})).toBeVisible();
        await expect(confirmation.getByRole('button', {name: 'Cancel', exact: true})).toHaveCount(0);
        await confirmation.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(confirmation).toBeHidden({timeout: 30_000});
        await expect(publishPanel).toBeHidden({timeout: 30_000});
        // The window's "Confirm" recorded the version choice (a
        // publication write), and on this build that write logs its own
        // "Submission metadata updated" line (T-ojs-2, run 2 of
        // 2026-09-16: two lines here, not the move's one). The count is
        // read, not asserted, and bounds the last delete's read below.
        log = await metadataUpdatedLines(pub, MANAGER_NAME);
        await expect(log.rows.first()).toBeVisible({timeout: 30_000});
        const linesAfterConfirm = await log.rows.count();
        await log.close();

        // The last contributor: the emptied list shows "No items found."
        // beneath the unchanged "Order", "Preview" and "Add Contributor",
        // and Preview's three formats show nothing (Rule 5).
        await pub.openEntry('Contributors');
        await deleteContributor(page, panel, 'Ada Author');
        await expect(panel.noItemsMessage()).toBeVisible({timeout: 30_000});
        await expect(panel.rows()).toHaveCount(0);
        await expect(panel.orderButton()).toBeVisible();
        await expect(panel.previewButton()).toBeVisible();
        await expect(panel.addButton()).toBeVisible();
        const preview = await panel.openPreview();
        for (const format of ['Abbreviated', 'Publication Lists', 'Full']) {
            await expect(panel.previewRow(preview, format)).toBeVisible();
            await expect(panel.previewValue(preview, format)).toHaveText('');
        }
        await panel.closePanel(preview);

        // Control, second half: the deletes wrote nothing — the log holds
        // exactly what it held before the last delete (Side effects; the
        // "one entry" of the spec's sentence is T-ojs-2's).
        log = await metadataUpdatedLines(pub, MANAGER_NAME);
        await expect(log.rows.first()).toBeVisible({timeout: 30_000});
        await expect(log.rows).toHaveCount(linesAfterConfirm);
        await log.close();

        // … and no email arrived for the submitter (A8).
        await expectNoMailToSubmitter(page, pkpMail, {
            tag,
            controlSubmissionId: control.submissionId,
            author,
            spare,
        });
        expect(await pkpMail.count({to: `${tag}n@mail.test`})).toBe(0);
    });

    test('S4: record affiliations, typed with per-language names', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag, {bilingual: true});
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
        });
        const instName = 'Probe Institute';
        const primaryLocaleMessage = 'Please provide affiliation name in the submission primary locale.';

        const page = await (await asUser(manager)).newPage();
        await stubRegistrySearch(page);
        const panel = await openContributors(page, tag, submissionId);

        // A typed institution: the field's guidance, then the typed-entry
        // path: type the name, pick the typed text itself, press "Add"
        // (which exists only after the pick); the entry joins the list
        // with "Edit institution name" and "Remove institution" behind its
        // "Click to edit or delete" button (Fields).
        let dialog = await panel.openEdit('Ada Author');
        await expect(
            panel
                .affiliationsField(dialog)
                .getByText('Enter the full name of the institution below')
        ).toBeVisible({timeout: 30_000});
        await expect(panel.affiliationAddButton(dialog)).toHaveCount(0);
        await panel.typeAndPickTypedInstitution(dialog, instName);
        await expect(panel.affiliationAddButton(dialog)).toBeEnabled({timeout: 30_000});
        await panel.affiliationAddButton(dialog).click();
        // Seeded contributors carry no country; fill the required field so
        // the saves below are refused for the affiliation alone (A16).
        await panel.fillPerson(dialog, {country: 'Canada'});
        const row = panel.affiliationRow(dialog, instName);
        await expect(row).toBeVisible({timeout: 30_000});
        await expect(row.getByRole('button', {name: 'Click to edit or delete'})).toBeVisible();
        await row.getByRole('button', {name: 'Click to edit or delete'}).click();
        await expect(page.getByRole('menuitem', {name: 'Edit institution name', exact: true})).toBeVisible();
        await expect(page.getByRole('menuitem', {name: 'Remove institution', exact: true})).toBeVisible();
        // The journal has two submission languages and only English is
        // filled: the completeness status says so.
        await page.getByRole('menuitem', {name: 'Edit institution name', exact: true}).click();
        await expect(row).toContainText('1 of 2 languages completed');

        // The per-language names: "Edit institution name" opened one name
        // box per language, the first holding the typed name.
        const nameBoxes = panel.affiliationNameBoxes(dialog, instName);
        await expect(nameBoxes).toHaveCount(2, {timeout: 30_000});
        await expect(nameBoxes.first()).toHaveValue(instName);
        await expect(nameBoxes.nth(1)).toHaveValue('');

        // An empty primary-language name: the submission language's box
        // cleared, Save is refused with the field's own message (the
        // foot's summary is A7's, not asserted); the name typed back.
        await nameBoxes.first().fill('');
        await panel.saveRefused(
            dialog,
            panel.affiliationsField(dialog).getByText(primaryLocaleMessage)
        );
        await expect(panel.affiliationNameBox(dialog, 'English')).toBeVisible();
        await expect(panel.saveButton(dialog)).toBeDisabled();
        await panel.affiliationNameBox(dialog, 'English').fill(instName);

        // Both saved: Save the contributor and reopen "Edit": the
        // institution is there (Rule 4; Fields). Control: the second
        // language's box stayed empty throughout and the save went
        // through — only the submission language's copy is required.
        await panel.savePanel(dialog);
        dialog = await panel.openEdit('Ada Author');
        await expect(panel.affiliationRow(dialog, instName)).toBeVisible({
            timeout: 30_000,
        });
        await expect(panel.affiliationRow(dialog, instName)).toContainText(
            '1 of 2 languages completed'
        );

        // Removing one: "Remove institution" asks "Are you sure?" with the
        // named warning; "Yes" removes it, and a save persists the removal.
        await panel.openAffiliationAction(dialog, instName, 'Remove institution');
        const confirm = panel.affiliationDeleteDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await expect(confirm).toContainText('Are you sure?');
        await expect(confirm).toContainText(`The affiliation ${instName} will be deleted.`);
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
        const roleName = 'Handling editor';

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

        // "Edit Role": the Role Identifier drop-down offers only EDITOR,
        // the role's own identifier (Rule 12; Fields).
        const edit = await roles.openEditRole(roleName);
        await expect(roles.identifierSelect(edit).locator('option')).toHaveCount(1);
        await expect(roles.identifierSelect(edit)).toHaveValue('EDITOR');
        await roles.closeRoleDialog(edit);

        // Tick the new role on the submission's contributor — its badge
        // joins the row.
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Contributors');
        let dialog = await panel.openEdit('Ada Author');
        await panel.tickRole(dialog, roleName);
        // Seeded contributors carry no country; fill the required field so
        // the save is not refused client-side (A16).
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

        // The deletion, and the Control: untick the role on the
        // contributor, then delete it: the confirm button enables only on
        // an exact identifier match, and the same dialog now ends in "Role
        // Deleted" — the refusals are the held role's and the last AUTHOR
        // role's alone.
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

        // The last AUTHOR role: while the contributor still holds "Author",
        // the in-use refusal is the one shown; off the role (Translator
        // on, Author off), the "Error" reads "Last AUTHOR role cannot be
        // deleted." (Rule 13).
        await roles.openRoleAction('AUTHOR', 'Delete Role');
        confirmDialog = roles.typeToConfirmDialog();
        await expect(confirmDialog).toBeVisible({timeout: 30_000});
        await confirmDialog.getByRole('textbox').fill('AUTHOR');
        await roles.confirmDeleteButton(confirmDialog).click();
        error = roles.errorDialog();
        await expect(error).toBeVisible({timeout: 30_000});
        await expect(error).toContainText(
            'One or more contributors are using this role. Change the role to another before delete.'
        );
        await error.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(error).toHaveCount(0, {timeout: 30_000});
        await expect(roles.roleRow('AUTHOR')).toBeVisible();

        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Contributors');
        dialog = await panel.openEdit('Ada Author');
        await panel.tickRole(dialog, 'Translator');
        await panel.untickRole(dialog, 'Author');
        await panel.savePanel(dialog);
        await expect(panel.badge('Ada Author', 'Translator')).toBeVisible({
            timeout: 30_000,
        });
        await expect(panel.badge('Ada Author', 'Author')).toHaveCount(0);

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
        test.setTimeout(300_000);
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
        // affiliation, a Bio Statement, a second role and the CRediT role
        // "Conceptualization" at "Lead", and adds a plain second
        // contributor (the published version stays editable).
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
        await panel.addCreditRole(dialog, 'Conceptualization', 'Lead');
        // Seeded contributors carry no country; fill the required field so
        // the save is not refused client-side (A16).
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

        // Pin the list order (Alex first) so the list-order assertions
        // below do not depend on insertion order (belt-and-braces since
        // A15's retirement; footnote s6).
        await panel.makeFirst('Alex Author');

        // Control: in the workflow, the list shows the "Primary Contact"
        // badge on the submitting author's row — the choice readers never
        // see (Rules 3, 10).
        await expect(panel.badge('Alex Author', 'Primary Contact')).toBeVisible({timeout: 30_000});

        // The anonymous reader's landing page credits both in list order:
        // names, the affiliation name, the role names, and the first
        // contributor's CRediT role with its degree (Rule 14; Fields).
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
        await expect(authorItems.first().locator('.credit_roles')).toContainText('Conceptualization');
        await expect(authorItems.first().locator('.credit_roles')).toContainText('(Lead)');
        await expect(authorItems.nth(1)).toContainText('Noa Secondi');
        await expect(
            authorItems.nth(1).locator('.contributor_roles')
        ).toContainText('Author');
        await expect(authorItems.nth(1).locator('.credit_roles')).toHaveCount(0);

        // No contact mark: the landing page marks nobody as the primary
        // contact (Rule 10) — the rendered authors block above is the
        // positive control.
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
        // "Full" format — names with roles in parentheses (Rule 15) — and
        // marks no contact either (Rule 10; the author line is the control).
        await page.goto(`/index.php/${JOURNAL}/issue/current`);
        const summary = page
            .locator('.obj_article_summary')
            .filter({hasText: `Submission ${tag}`});
        await expect(summary).toBeVisible({timeout: 30_000});
        const authorLine = summary.locator('.meta .authors');
        await expect(authorLine).toContainText('Alex Author (');
        await expect(authorLine).toContainText('Translator');
        await expect(authorLine).toContainText('Noa Secondi (Author)');
        await expect(page.getByText('Primary Contact')).toHaveCount(0);
    });

    test('S7: keep a contributor out of publication lists', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
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

        // A second contributor.
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

        // Control: before any untick, "Publication Lists" and "Full" read
        // the same names and roles (Rule 7).
        let preview = await panel.openPreview();
        await expect(panel.previewValue(preview, 'Full')).toContainText('Bela Brant', {
            timeout: 30_000,
        });
        const fullBefore = await panel.previewValue(preview, 'Full').innerText();
        await expect(panel.previewValue(preview, 'Publication Lists')).toHaveText(fullBefore);
        await panel.closePanel(preview);

        // The untick: "Preview" omits the second contributor from
        // "Publication Lists" while "Full" keeps them (Rule 8; Fields;
        // "Full" holding the name is the positive control).
        dialog = await panel.openEdit('Bela Brant');
        await panel.publicationListsBox(dialog).uncheck();
        await panel.savePanel(dialog);
        preview = await panel.openPreview();
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

        // The reader pages: the landing page still credits both (Rule 8's
        // clean half; the journal listing's behavior is A3's — not read).
        await page.goto(`/index.php/${JOURNAL}/article/view/${submissionId}`);
        const authors = page.locator('.item.authors');
        await expect(authors).toBeVisible({timeout: 30_000});
        await expect(authors).toContainText('Alex Author');
        await expect(authors).toContainText('Bela Brant');

        // "Abbreviated" ignores the tick: the second contributor re-ticked
        // and the first unticked, "Publication Lists" omits the first while
        // "Abbreviated" still reads the first contributor's family name
        // plus "et al." (Rule 8).
        dialog = await panel.openEdit('Bela Brant');
        await panel.publicationListsBox(dialog).check();
        await panel.savePanel(dialog);
        dialog = await panel.openEdit('Alex Author');
        await panel.publicationListsBox(dialog).uncheck();
        // The seeded contributor carries no country; fill it so the save
        // is not refused client-side (A16).
        await panel.fillPerson(dialog, {country: 'Canada'});
        await panel.savePanel(dialog);
        preview = await panel.openPreview();
        await expect(panel.previewValue(preview, 'Publication Lists')).toContainText('Bela Brant', {
            timeout: 30_000,
        });
        await expect(panel.previewValue(preview, 'Publication Lists')).not.toContainText('Alex Author');
        await expect(panel.previewValue(preview, 'Full')).toContainText('Alex Author');
        await expect(panel.previewValue(preview, 'Abbreviated')).toHaveText('Author et al.');
        await panel.closePanel(preview);
    });

    test('S8: require competing interests', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s8', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
        });
        const ciText = 'No competing interests.';
        // The field's own guidance is its stable marker (the label text
        // carries the required marker inline).
        const ciGuidance = 'Please disclose any competing interests';

        const page = await (await asUser(manager)).newPage();
        const pub = new PublicationScreen(page, tag);
        const panel = new ContributorsPanel(page);

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

        // Control: before the tick, the contributor's form has no
        // "Competing Interests" field (the sibling Bio Statement is the
        // positive control that the form rendered).
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Contributors');
        let dialog = await panel.openEdit('Ada Author');
        await expect(dialog.getByText('Bio Statement', {exact: false})).toBeVisible({
            timeout: 30_000,
        });
        await expect(dialog.getByText(ciGuidance)).toHaveCount(0);
        await panel.closePanel(dialog);

        // The setting: tick the requirement on the workflow settings'
        // Metadata screen; editing any contributor now shows the required
        // field (Settings; Fields).
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

        // An empty statement: refused on the form, "This field is
        // required." under the field and "Please correct one error." at
        // the foot (Fields). The seeded contributor's Country is filled so
        // the refusal is exactly one error (A16).
        await panel.fillPerson(dialog, {country: 'Canada'});
        await panel.saveRefused(dialog, panel.errorSummary(dialog, 1));
        await expect(dialog.getByText('This field is required.').first()).toBeVisible();

        // A statement: filling it saves; the panel closes and the
        // statement persists (Rule 4; Fields).
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

        // The setting off: the field is gone from the form (the sibling
        // Bio Statement stays — the positive control) …
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

        // The setting on again: the field is back with the statement
        // intact (Settings).
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

    test('S9: the read-only list', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s9', testInfo);
        const [{submissionId}, draft] = await Promise.all([
            ojsApi.createSubmission({
                tag,
                context: JOURNAL,
                submitter: 'author.alex',
                title: `Submission ${tag}`,
            }),
            ojsApi.createSubmission({
                tag: `${tag}d`,
                context: JOURNAL,
                submitter: 'author.alex',
                title: `Submission ${tag}d`,
                submitted: false,
            }),
        ]);

        // The second contributor is added by the Journal Manager, whose
        // list is also the Control (the editable side): "Order", "Preview"
        // and "Add Contributor" above the rows, and each row's "Primary
        // Contact" or "Set Primary Contact", "Edit" and "Delete" (Rules 2,
        // 3).
        const managerPage = await (await asUser('manager.maya')).newPage();
        const managerPanel = await openContributors(managerPage, JOURNAL, submissionId);
        const dialog = await managerPanel.openAdd();
        await managerPanel.fillPerson(dialog, {
            given: 'Noa',
            family: 'Second',
            email: `${tag}n@mail.test`,
            country: 'Canada',
        });
        await managerPanel.tickRole(dialog, 'Author');
        await managerPanel.savePanel(dialog);
        await expect(managerPanel.row('Noa Second')).toBeVisible({timeout: 30_000});
        await expect(managerPanel.orderButton()).toBeVisible();
        await expect(managerPanel.previewButton()).toBeVisible();
        await expect(managerPanel.addButton()).toBeVisible();
        await expect(managerPanel.badge('Alex Author', 'Primary Contact')).toBeVisible();
        await expect(managerPanel.setPrimaryContactButton('Noa Second')).toBeVisible();
        for (const name of ['Alex Author', 'Noa Second']) {
            await expect(
                managerPanel.row(name).getByRole('button', {name: 'Edit', exact: true})
            ).toBeVisible();
            await expect(
                managerPanel.row(name).getByRole('button', {name: 'Delete', exact: true})
            ).toBeVisible();
        }

        // The Author's list: the rows show names and role badges, and
        // "Preview" is there; "Order", "Add Contributor", "Set Primary
        // Contact", "Edit" and "Delete" are absent, and no row carries the
        // "Primary Contact" badge (Rule 9; Actors row 2; the manager's
        // list above is the positive control for every absence).
        const authorPage = await (await asUser('author.alex')).newPage();
        const authorPanel = await openContributors(authorPage, JOURNAL, submissionId, {
            author: true,
        });
        await expect(authorPanel.row('Alex Author')).toBeVisible({timeout: 30_000});
        await expect(authorPanel.badge('Alex Author', 'Author')).toBeVisible();
        await expect(authorPanel.row('Noa Second')).toBeVisible();
        await expect(authorPanel.badge('Noa Second', 'Author')).toBeVisible();
        await expect(authorPanel.previewButton()).toBeVisible();
        await expect(authorPanel.orderButton()).toHaveCount(0);
        await expect(authorPanel.addButton()).toHaveCount(0);
        for (const name of ['Alex Author', 'Noa Second']) {
            await expect(authorPanel.setPrimaryContactButton(name)).toHaveCount(0);
            await expect(
                authorPanel.row(name).getByRole('button', {name: 'Edit', exact: true})
            ).toHaveCount(0);
            await expect(
                authorPanel.row(name).getByRole('button', {name: 'Delete', exact: true})
            ).toHaveCount(0);
        }
        await expect(authorPanel.primaryContactBadges()).toHaveCount(0);

        // Preview: "List of Contributors" opens with its "Abbreviated",
        // "Publication Lists" and "Full" rows (Rule 7).
        const preview = await authorPanel.openPreview();
        for (const format of ['Abbreviated', 'Publication Lists', 'Full']) {
            await expect(authorPanel.previewRow(preview, format)).toBeVisible();
        }
        await expect(authorPanel.previewValue(preview, 'Full')).toContainText('Alex Author');
        await authorPanel.closePanel(preview);

        // The wizard's Contributors step: the Author's own unsubmitted
        // draft, opened in the submission wizard, lists the same shape with
        // "Order", "Preview" and "Add Contributor" above the rows and
        // "Edit" and "Delete" on the row, editable as always there (Actors
        // row 3; Cross-feature interactions).
        const wizard = new SubmissionWizardPage(authorPage, JOURNAL);
        await wizard.goto(draft.submissionId);
        await wizard.expectStep('Upload Files');
        await wizard.continueTo('Details');
        await wizard.continueTo('Contributors');
        const wizardPanel = new ContributorsPanel(authorPage);
        await expect(wizardPanel.row('Alex Author')).toBeVisible({timeout: 30_000});
        await expect(wizardPanel.orderButton()).toBeVisible();
        await expect(wizardPanel.previewButton()).toBeVisible();
        await expect(wizardPanel.addButton()).toBeVisible();
        await expect(
            wizardPanel.row('Alex Author').getByRole('button', {name: 'Edit', exact: true})
        ).toBeVisible();
        await expect(
            wizardPanel.row('Alex Author').getByRole('button', {name: 'Delete', exact: true})
        ).toBeVisible();
    });

    test('S11: the reviewer\'s browser never receives the contributor list', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s11', testInfo);
        // Two scratch journals: one at the install defaults ("Anonymous
        // Reviewer/Anonymous Author"), one whose default review type is
        // "Open"; each with a submission in review and the Reviewer's
        // accepted request (footnote s11).
        const seedJournalInReview = async (path, options) => {
            const {reviewer, author} = await seedJournal(ojsApi, path, {reviewer: true, ...options});
            const {submissionId} = await ojsApi.createSubmission({
                tag: `${path}s`,
                context: path,
                submitter: author,
                title: `Submission ${path}s`,
                decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [{username: reviewer, status: 'accepted'}]}],
            });
            return {path, reviewer, submissionId};
        };
        const [anonymous, open] = await Promise.all([
            seedJournalInReview(`${tag}a`),
            seedJournalInReview(`${tag}o`, {review: {defaultReviewMode: 'open'}}),
        ]);

        /**
         * As the Reviewer, open the request from the reviewer dashboard
         * and read the publication the page fetches for "View All
         * Submission Details" (`GET …/submissions/{id}/publications/{id}`,
         * the page's own traffic: read live 2026-09-16,
         * `.reports/U41/tojs/details-*.json`); the reviewer's screens
         * themselves are not asserted.
         */
        const fetchedPublication = async ({path, reviewer, submissionId}) => {
            const page = await (await asUser(reviewer)).newPage();
            const list = new ReviewerAssignmentsPage(page, path);
            await list.goto('actionRequired');
            const row = list.row(`Submission ${path}s`);
            await expect(row).toBeVisible({timeout: 30_000});
            await list.openWizard(row, 'Finish review');
            const wizard = new ReviewWizardPage(page, path);
            await wizard.expectOpen();
            const fetched = page.waitForResponse(
                (r) =>
                    r.url().includes(`/submissions/${submissionId}/publications/`) &&
                    r.request().method() === 'GET' &&
                    r.ok(),
                {timeout: 30_000}
            );
            const details = await wizard.openSubmissionDetails();
            const publication = await (await fetched).json();
            await wizard.closeDialog(details);
            return publication;
        };

        // The anonymous assignment: the data carries no contributor — an
        // empty list and empty author strings (Rule 17).
        const withheld = await fetchedPublication(anonymous);
        expect(withheld.authors).toEqual([]);
        expect(withheld.authorsString).toBe('');
        expect(withheld.authorsStringShort).toBe('');
        expect(withheld.authorsStringIncludeInBrowse).toBe('');

        // Control: on the open assignment the same data carries the full
        // contributor list (Rule 17).
        const full = await fetchedPublication(open);
        expect(full.authors).toHaveLength(1);
        expect(full.authors[0].fullName).toBe('Ada Author');
        expect(full.authorsString).toContain('Ada Author');
        expect(full.authorsStringShort).not.toBe('');
    });
});
