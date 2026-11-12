// @ts-check
/**
 * @file playwright/tests/U41-contributors-and-affiliations.spec.js
 *
 * Contributors & affiliations — OPS suite, one test per canonical COMMON
 * scenario as a preprint server runs it (S1–S9, S12 and S13, in OPS
 * vocabulary: preprint server, preprint, the workflow's Publication-area
 * nav group is labeled "Preprint" and its pages are headed "Preprint:
 * {entry}", posting is "Post", the reader listing surface is the archive at
 * /preprints, the Moderator is the section editor) with S9's preprint-server
 * end (OPS1: the submitting author EDITS their own not-yet-posted
 * preprint's contributors). S10 is {OMP}; S11 {OJS OMP}: a preprint server
 * installs no review stage, so it has no S11 test and no absence test
 * either. A bullet the register marks carries only the scenario's own
 * sentence.
 * Spec: docs/specs/U41-contributors-and-affiliations.md
 *
 * Deliberately NOT covered (register IDs; the spec's Coverage section
 * records everything else left out): A1, A3, A5, A7, A9, A10, A12, A14, A20,
 * A22, A24, A25, A26, A27, A28, A29, A30, A31, A32, A33, OPS2 (🐞, never
 * asserted either way); A2, A4, A6, A8, A11, A13, A16, A17, A18, A19 (❓,
 * only the scenario's own sentence); OMP1, OMP2 (no OPS surface).
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only at the server level — S1, S2, S3, S7 and S9 mutate only
 * their own seeded submissions there (S1's and S3's Author is a throwaway
 * account created on a scratch server, for the mailbox read's scoping);
 * every settings or server-level mutation (S4's second submission
 * language, S5's roles, S6's clean archive, S8's setting, S13's French
 * role name) runs on a scratch preprint server with throwaway users.
 * Contributors beyond the auto-created submitter are recorded through the
 * panel, the surface under test, except S12's, seeded with
 * `contributors[]`; S12's edits are sent in the Journal Manager's signed-in
 * session with its CSRF token (footnote s12). Waits are
 * event-based (contributors/publications/contributorRoles API responses,
 * web-first assertions) — no hard-coded sleeps. Every absence read is
 * bounded by a positive control taken the same way (PRINCIPLES M4, M6; the
 * mailbox reads by the discussion mail the test itself causes, A8; the
 * Activity Log reads by the "Set Primary Contact" line the test writes).
 * Everything runs in the parallel `ops` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {ContributorsScreen} = require('../pages/ContributorPages.js');
const {closeMenu} = require('../../../../shared/playwright/support/menus.js');
const {stubRegistrySearch} = require('../pages/FundingPages.js');
const {
    PublicationScreen,
    openWorkflow,
    openPublicationPage,
    createNewVersion,
    saveSettingsPanel,
    activityLogCounts,
    sendMailControl,
} = require('../pages/PublicationPages.js');
const {
    STEPS,
    wizardUrl,
    expectWizardOpen,
    continueTo,
} = require('../pages/SubmissionWizardPages.js');

const PK = 'publicknowledge';
const PK_PREFIX = '/en';
const REQUIRED = 'This field is required.';
const PRIMARY_LOCALE_NAME = 'Please provide affiliation name in the submission primary locale.';

/** A string as a literal inside a RegExp. */
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u41${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
function mailOf(username) {
    return `${username}@mail.test`;
}

/** Throwaway user spec for scratch contexts. */
function contextUsers(tag) {
    return [
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
}

/** Open a preprint's workflow and its Contributors screen. */
async function openContributors(page, contextPath, submissionId, options = {}) {
    await openWorkflow(page, contextPath, submissionId, options);
    const screen = new ContributorsScreen(page);
    await screen.openFromWorkflow();
    return screen;
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

/**
 * Assert the full editable list (Rules 2, 3, 9): "Order", "Preview" and
 * "Add Contributor" above the rows; on each named row "Edit", "Delete" and
 * either the "Primary Contact" badge (the contact) or "Set Primary Contact".
 *
 * @param {ContributorsScreen} screen
 * @param {{contact: string, others: string[]}} rows
 */
async function expectEditableList(screen, {contact, others}) {
    await expect(screen.orderButton()).toBeVisible({timeout: 30_000});
    await expect(screen.previewButton()).toBeVisible();
    await expect(screen.addContributorButton()).toBeVisible();
    await expect(screen.primaryContactBadge(contact)).toBeVisible();
    await expect(screen.setPrimaryContactButton(contact)).toHaveCount(0);
    await expect(screen.rowEditButton(contact)).toBeVisible();
    await expect(screen.rowDeleteButton(contact)).toBeVisible();
    for (const name of others) {
        await expect(screen.setPrimaryContactButton(name)).toBeVisible();
        await expect(screen.primaryContactBadge(name)).toHaveCount(0);
        await expect(screen.rowEditButton(name)).toBeVisible();
        await expect(screen.rowDeleteButton(name)).toBeVisible();
    }
}

test.describe('Contributors & affiliations (U41)', () => {
    test('S1: maintain the contributor list', {tag: '@smoke'}, async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s1', testInfo);
        // The Author is a throwaway account (created on a scratch server,
        // enrolled on the seeded server by the submission seed as the
        // wizard would), so the mailbox read below is scoped to addresses
        // this test alone controls (A8; footnote s1).
        const author = `${tag}au`;
        await opsApi.createContext({tag, users: contextUsers(tag).slice(1)});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: PK,
            submitter: author,
            title: `Submission ${tag}`,
        });
        // The spec's addresses are alan@example.test and its siblings; the
        // mail catcher is shared across workers and fleets, so each address
        // carries the tag (A8).
        const alanMail = mailOf(`${tag}alan`);
        const orgMail = mailOf(`${tag}org`);
        const anonMail = mailOf(`${tag}anon`);

        const page = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(page);
        await openWorkflow(page, PK, submissionId);

        // "Contributors": the entry sits second in the Preprint group, right
        // after "Title & Abstract"; the page is headed "Preprint:
        // Contributors" with "Order", "Preview" and "Add Contributor" above
        // the rows; the submitting author is listed with an "Author" badge,
        // the "Primary Contact" badge, "Edit" and "Delete" (Rules 2, 3, 10).
        const contributorsEntry = page.getByRole('link', {name: 'Contributors', exact: true});
        await expect(contributorsEntry).toBeVisible({timeout: 30_000});
        await expect(
            contributorsEntry.locator('xpath=ancestor::li[1]/preceding-sibling::li[1]')
        ).toContainText('Title & Abstract');
        await expect(
            contributorsEntry.locator('xpath=ancestor::li[1]/preceding-sibling::li')
        ).toHaveCount(1);
        const screen = new ContributorsScreen(page);
        await screen.openFromWorkflow();
        await expectEditableList(screen, {contact: 'Ada Author', others: []});
        await expect(screen.roleBadge('Ada Author', 'Author')).toBeVisible();
        // The Activity Log's baseline (a seeded item already carries its
        // submit lines), for "no new entry" and the Control's one line.
        const logBefore = await activityLogCounts(page);

        // "An empty save": the panel opens on "Person"; Save with nothing
        // filled: "This field is required." under Given Name, Email, Country
        // and Contributor Roles, "Please correct 4 errors." with "Jump to
        // next error", and Save disabled until one of them is edited
        // (Fields).
        let panel = await screen.openAddPanel();
        await expect(screen.typeRadio(panel, 'Person')).toBeChecked();
        await expect(screen.typeRadio(panel, 'Organization or group')).toBeVisible();
        await expect(screen.typeRadio(panel, 'Anonymous')).toBeVisible();
        await screen.saveButton(panel).click();
        await expect(screen.fieldError(panel, 'givenName', 'en')).toHaveText(REQUIRED, {
            timeout: 30_000,
        });
        await expect(screen.fieldError(panel, 'email')).toHaveText(REQUIRED);
        await expect(screen.fieldError(panel, 'country')).toHaveText(REQUIRED);
        await expect(screen.fieldError(panel, 'contributorRoles')).toContainText(REQUIRED);
        await expect(screen.errorSummary(panel)).toHaveText(/Please correct 4 errors\./);
        await expect(screen.jumpToNextErrorButton(panel)).toBeVisible();
        await expect(screen.saveButton(panel)).toBeDisabled();
        // Save stayed disabled with Given Name alone edited (T-ops-1 in the
        // findings file: the spec's "until one of them is edited"); it is
        // read as enabled once the flagged fields are edited, below.
        await screen.input('givenName', 'en').fill('Alan');

        // "A bad Email and Homepage URL": the save is refused, the panel
        // stays open with an error under Email and under Homepage URL (the
        // body quotes no message text, so the refusal alone is asserted).
        await screen.input('email').fill('not-an-address');
        await screen.input('url').fill('not a web address');
        await screen.input('country').selectOption({label: 'Canada'});
        await screen.roleCheckbox(panel, 'Author').check();
        await expect(screen.saveButton(panel)).toBeEnabled({timeout: 10_000});
        await screen.saveButton(panel).click();
        await expect(screen.fieldError(panel, 'email')).toBeVisible({timeout: 30_000});
        await expect(screen.fieldError(panel, 'url')).toBeVisible();
        await expect(panel).toBeVisible();
        await expect(screen.fieldError(panel, 'givenName', 'en')).toHaveCount(0);

        // "The person": a valid Email, Homepage URL cleared, Save: the panel
        // closes and the row shows "Alan" with an "Author" badge (Rule 4).
        await screen.input('email').fill(alanMail);
        await screen.input('url').fill('');
        await screen.saveForm(panel);
        await expect(screen.row('Alan')).toBeVisible({timeout: 30_000});
        await expect(screen.roleBadge('Alan', 'Author')).toBeVisible();

        // "The type switch": "Casey" typed as Given Name, then "Organization
        // or group": the name fields swap to "Organization Name"; "Probe
        // Org" saved with an "Author" badge; its "Edit" switched to "Person"
        // shows an empty Given Name (the other type's entry discarded on
        // save, as the guidance warns); switched back and saved (Fields;
        // Rule 4).
        panel = await screen.openAddPanel();
        await screen.input('givenName', 'en').fill('Casey');
        await screen.typeRadio(panel, 'Organization or group').check();
        await expect(screen.input('organizationName', 'en')).toBeVisible();
        await expect(screen.input('givenName', 'en')).toHaveCount(0);
        await screen.input('organizationName', 'en').fill('Probe Org');
        await screen.input('email').fill(orgMail);
        await screen.input('country').selectOption({label: 'Canada'});
        await screen.roleCheckbox(panel, 'Author').check();
        await screen.saveForm(panel);
        await expect(screen.row('Probe Org')).toBeVisible({timeout: 30_000});
        await expect(screen.roleBadge('Probe Org', 'Author')).toBeVisible();
        panel = await screen.openEditPanel('Probe Org');
        await expect(screen.input('organizationName', 'en')).toHaveValue('Probe Org');
        await screen.typeRadio(panel, 'Person').check();
        await expect(screen.input('givenName', 'en')).toBeVisible();
        await expect(screen.input('givenName', 'en')).toHaveValue('');
        await screen.typeRadio(panel, 'Organization or group').check();
        await expect(screen.input('organizationName', 'en')).toHaveValue('Probe Org');
        await screen.saveForm(panel);
        await expect(screen.row('Probe Org')).toBeVisible({timeout: 30_000});

        // "Edit": the person's "Edit" prefilled; a Family Name saved: the
        // row reads "Alan Mwandenga" (Rule 4).
        panel = await screen.openEditPanel('Alan');
        await expect(screen.input('givenName', 'en')).toHaveValue('Alan');
        await screen.input('familyName', 'en').fill('Mwandenga');
        await screen.saveForm(panel);
        await expect(screen.row('Alan Mwandenga')).toBeVisible({timeout: 30_000});

        // "Close" and the Escape key: "Closed" typed as Family Name and
        // "Close" pressed: the panel shuts at once, with no question (the
        // one dialog left is the workflow page itself, headed "Preprint:
        // Contributors", where the open panel was the one dialog before)
        // and no notice; "Escaped" typed and Escape pressed: the same; a
        // reload of the page shows the row still "Alan Mwandenga" (Rule 4).
        const dialogs = page.getByRole('dialog');
        const notices = page.locator('.app__notifications .pkpNotification');
        const workflowHeading = page.getByRole('heading', {name: 'Preprint: Contributors'});
        panel = await screen.openEditPanel('Alan Mwandenga');
        await expect(dialogs).toHaveCount(1);
        await expect(dialogs).toHaveAccessibleName('Edit');
        await screen.input('familyName', 'en').fill('Closed');
        await screen.closePanel(panel);
        await expect(dialogs).toHaveCount(1);
        await expect(dialogs.getByRole('heading', {name: 'Preprint: Contributors'})).toBeVisible();
        await expect(page.locator('.app__notifications')).toBeAttached();
        await expect(notices).toHaveCount(0);
        panel = await screen.openEditPanel('Alan Mwandenga');
        await expect(dialogs).toHaveAccessibleName('Edit');
        await expect(screen.input('familyName', 'en')).toHaveValue('Mwandenga');
        await screen.input('familyName', 'en').fill('Escaped');
        await screen.closePanelWithEscape(panel, screen.input('familyName', 'en'));
        await expect(dialogs).toHaveCount(1);
        await expect(workflowHeading).toBeVisible();
        await expect(notices).toHaveCount(0);
        await screen.reload();
        await expect(screen.row('Alan Mwandenga')).toBeVisible({timeout: 30_000});
        await expect(screen.row('Alan Closed')).toHaveCount(0);
        await expect(screen.row('Alan Escaped')).toHaveCount(0);

        // "The CRediT table": the person's "Edit" reads "No Items" in the
        // table; "Add Another Role" draws a row on "Conceptualization" with
        // "Degree" empty; a second press, a second row on
        // "Conceptualization" too, each row's role list showing
        // "Conceptualization" grayed out (each list read by its own row, A25;
        // another role enabled in it is the positive control); "Remove Role"
        // on the second row and Save; reopened, the table holds the one row,
        // "Conceptualization", "Degree" still empty (Fields).
        panel = await screen.openEditPanel('Alan Mwandenga');
        const credit = screen.creditRolesTable(panel);
        await expect(credit).toContainText('No Items');
        await expect(screen.creditRoleRows(panel)).toHaveCount(0);
        await screen.pressAddAnotherRole(panel);
        const creditRows = screen.creditRoleRows(panel);
        await expect(screen.creditRoleSelect(creditRows.nth(0))).toHaveValue(/conceptualization/);
        await expect(screen.creditDegreeSelect(creditRows.nth(0))).toHaveValue('');
        await expect(credit).not.toContainText('No Items');
        await screen.pressAddAnotherRole(panel);
        await expect(creditRows).toHaveCount(2);
        for (const n of [0, 1]) {
            const roleSelect = screen.creditRoleSelect(creditRows.nth(n));
            await expect(roleSelect).toHaveValue(/conceptualization/);
            await expect(
                roleSelect.locator('option', {hasText: /^Conceptualization$/})
            ).toBeDisabled();
            await expect(
                roleSelect.locator('option', {hasText: /^Data Curation$/})
            ).toBeEnabled();
            await expect(screen.creditDegreeSelect(creditRows.nth(n))).toHaveValue('');
        }
        await screen.creditRemoveButton(creditRows.nth(1)).click();
        await expect(creditRows).toHaveCount(1);
        await screen.saveForm(panel);
        panel = await screen.openEditPanel('Alan Mwandenga');
        await expect(screen.creditRoleRows(panel)).toHaveCount(1, {timeout: 30_000});
        await expect(
            screen.creditRoleSelect(screen.creditRoleRows(panel).nth(0))
        ).toHaveValue(/conceptualization/);
        await expect(
            screen.creditDegreeSelect(screen.creditRoleRows(panel).nth(0))
        ).toHaveValue('');
        await screen.closePanel(panel);

        // "An Anonymous contributor": the "Person" form shows the name
        // fields, Homepage URL, Bio Statement and Affiliations, the
        // organization form the ROR ID box (the positive controls); under
        // "Anonymous" none of them, only Email, Country, Contributor Roles,
        // CRediT roles and Publication Lists; saved, the row is titled
        // "Anonymous" with an "Author" badge and "Preview"'s "Full" row ends
        // "; Anonymous (Author)" (Fields; Rules 3, 7).
        panel = await screen.openAddPanel();
        await expect(screen.input('givenName', 'en')).toBeVisible();
        await expect(screen.input('familyName', 'en')).toBeVisible();
        await expect(screen.input('url')).toBeVisible();
        await expect(
            page.locator(`iframe#${screen.controlId('biography', 'en')}_ifr`)
        ).toBeVisible();
        await expect(screen.affiliationsField(panel)).toBeVisible();
        await screen.typeRadio(panel, 'Organization or group').check();
        await expect(panel.getByText(/^ROR ID/).first()).toBeVisible();
        await screen.typeRadio(panel, 'Anonymous').check();
        await expect(screen.input('email')).toBeVisible();
        await expect(screen.input('country')).toBeVisible();
        await expect(panel.getByRole('group', {name: /^Contributor Roles/})).toBeVisible();
        await expect(screen.creditRolesTable(panel)).toBeVisible();
        await expect(screen.includeInBrowseCheckbox(panel)).toBeVisible();
        await expect(screen.input('givenName', 'en')).toHaveCount(0);
        await expect(screen.input('familyName', 'en')).toHaveCount(0);
        await expect(screen.input('organizationName', 'en')).toHaveCount(0);
        await expect(panel.getByText(/^ROR ID/)).toHaveCount(0);
        await expect(screen.input('url')).toHaveCount(0);
        await expect(
            page.locator(`iframe#${screen.controlId('biography', 'en')}_ifr`)
        ).toHaveCount(0);
        await expect(screen.affiliationsField(panel)).toHaveCount(0);
        await screen.input('email').fill(anonMail);
        await screen.input('country').selectOption({label: 'Canada'});
        await screen.roleCheckbox(panel, 'Author').check();
        await screen.saveForm(panel);
        await expect(screen.row('Anonymous')).toBeVisible({timeout: 30_000});
        await expect(screen.roleBadge('Anonymous', 'Author')).toBeVisible();
        await screen.openPreview();
        await expect(screen.previewValue('Full')).toHaveText(/; Anonymous \(Author\)$/);
        await screen.closePreview();

        // "Delete": the "Delete Contributor" dialog's question; "Cancel"
        // keeps the row; confirmed, the row is removed; the "Anonymous" row
        // the same way, its dialog asking to remove "Anonymous" (Rules 3, 5).
        await screen.rowDeleteButton('Probe Org').click();
        const confirm = screen.deleteContributorDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await expect(confirm).toContainText(
            'Are you sure you want to remove Probe Org as a contributor? This action can not be undone.'
        );
        await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(confirm).toHaveCount(0, {timeout: 30_000});
        await expect(screen.row('Probe Org')).toBeVisible();
        await screen.rowDeleteButton('Probe Org').click();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await screen.confirmDelete('Probe Org');
        await screen.rowDeleteButton('Anonymous').click();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await expect(confirm).toContainText(
            'Are you sure you want to remove Anonymous as a contributor? This action can not be undone.'
        );
        await screen.confirmDelete('Anonymous');
        await expect(screen.row('Alan Mwandenga')).toBeVisible();
        await expect(screen.rows()).toHaveCount(2);

        // "Nothing else happens": the Activity Log & Notes → History has no
        // new entry after the adds, edits and deletes (Side effects); the
        // mailbox is read below, once its control is sent.
        const logAfterEdits = await activityLogCounts(page);
        expect(logAfterEdits).toEqual(logBefore);

        // "Control": "Set Primary Contact" on the "Alan Mwandenga" row:
        // History now shows one new entry, "Submission metadata updated"
        // (Side effects).
        await screen.setPrimaryContact('Alan Mwandenga');
        await expect(screen.primaryContactBadge('Alan Mwandenga')).toBeVisible({
            timeout: 30_000,
        });
        const logAfterMove = await activityLogCounts(page);
        expect(logAfterMove.rows).toBe(logBefore.rows + 1);
        expect(logAfterMove.metadataUpdated).toBe(logBefore.metadataUpdated + 1);

        // The mailbox: no email arrived for the Author or for any of the
        // typed addresses from these saves (Side effects), bounded by a
        // mail this test causes the same way (A8).
        const afterControl = await sendMailControl({asUser, api: opsApi, tag});
        for (const to of [mailOf(author), alanMail, orgMail, anonMail]) {
            await pkpMail.expectNone({to, afterControl});
        }
    });

    test('S2: reorder and preview the display formats', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s2', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(page);
        let screen = await openContributors(page, PK, submissionId);

        // A second contributor with a distinct family name (the Given; no
        // "Save Order" is pressed on this submission before the reads below,
        // footnote s2).
        await screen.addPersonContributor({
            given: 'Greta',
            family: 'Zeta',
            email: mailOf(`${tag}g`),
        });
        await expect(screen.row('Greta Zeta')).toBeVisible({timeout: 30_000});

        // "Preview" (Rules 6, 7): with no "Save Order" pressed yet, the list
        // shows the submitting author first and the added contributor
        // second; "Abbreviated" is the first contributor's family name plus
        // "et al."; "Full" is both names each followed by "(Author)",
        // semicolon-separated.
        await expect(screen.rows()).toHaveCount(2);
        await expect(screen.rows().first()).toContainText('Alex Author');
        await expect(screen.rows().nth(1)).toContainText('Greta Zeta');
        let preview = await screen.openPreview();
        await expect(preview).toContainText(
            'Contributors to this publication will be identified in the following formats.'
        );
        await expect(screen.previewValue('Abbreviated')).toHaveText('Author et al.');
        await expect(screen.previewValue('Full')).toHaveText(
            'Alex Author (Author); Greta Zeta (Author)'
        );
        await screen.closePreview();

        // "Control": before "Save Order", the list shows the submitting
        // author first and the added contributor second on every reload,
        // and "Abbreviated" names their family name (Rule 6).
        for (let load = 0; load < 2; load++) {
            await screen.reload();
            await expect(screen.rows()).toHaveCount(2);
            await expect(screen.rows().first()).toContainText('Alex Author');
            await expect(screen.rows().nth(1)).toContainText('Greta Zeta');
            await screen.openPreview();
            await expect(screen.previewValue('Abbreviated')).toHaveText('Author et al.');
            await screen.closePreview();
        }

        // "Save Order" (Rule 6): "Order" swaps the header buttons for
        // "Save Order"/"Cancel" and gives each row named up/down arrows.
        await screen.orderButton().click();
        await expect(screen.saveOrderButton()).toBeVisible();
        await expect(screen.cancelOrderButton()).toBeVisible();
        await expect(screen.addContributorButton()).toHaveCount(0);
        await expect(screen.previewButton()).toHaveCount(0);
        // Content-verified reorder (campaign workaround): the screen can
        // remount mid-flow on the async publication refresh after a
        // contributor save, dropping Order mode or resetting the rows right
        // before "Save Order" serializes them, so the saveOrder POST can
        // persist the OLD order (response ok, content wrong). Each bounded
        // attempt (re-)enters ordering, redoes the move, saves with a
        // freshly armed response wait, and passes only when the screen,
        // re-rendered from the response, shows the new order.
        const orderScreen = screen;
        await expect(async () => {
            if (!(await orderScreen.saveOrderButton().isVisible())) {
                await orderScreen.orderButton().click({timeout: 2_000});
            }
            await orderScreen.moveUpButton('Greta Zeta').click({timeout: 2_000});
            await expect(orderScreen.rows().first()).toContainText('Greta Zeta', {
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
            await orderScreen.saveOrderButton().click({timeout: 2_000});
            await orderSaved;
            // The success handler re-renders the rows from the response —
            // this verifies the PERSISTED order, not the client echo.
            await expect(orderScreen.rows().first()).toContainText('Greta Zeta', {
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

        // "Cancel": "Order" again, move a row, "Cancel" — the saved order is
        // back. The move is content-verified like the save above: an arrow
        // press issued while the list re-renders into ordering mode can be
        // swallowed (ci-triage flake watch; CI run 34466942823, 2026-09-10),
        // so each bounded attempt (re-)enters ordering, waits for the row's
        // own arrow and passes only when the list shows the move. A repeat
        // press on an already-first row is a no-op.
        await expect(async () => {
            if (!(await reloaded.saveOrderButton().isVisible())) {
                await reloaded.orderButton().click({timeout: 2_000});
            }
            await expect(reloaded.moveUpButton('Alex Author')).toBeVisible({timeout: 5_000});
            await reloaded.moveUpButton('Alex Author').click({timeout: 2_000});
            await expect(reloaded.rows().first()).toContainText('Alex Author', {
                timeout: 2_000,
            });
        }).toPass({intervals: [1_000, 2_000], timeout: 60_000});
        await reloaded.cancelOrderButton().click();
        await expect(reloaded.rows().first()).toContainText('Greta Zeta', {
            timeout: 30_000,
        });
        await expect(reloaded.rows().nth(1)).toContainText('Alex Author');

        // "A new version": the first contributor's "Edit" gets a typed
        // affiliation "Probe Institute"; "Create New Version" confirmed
        // unchanged: the new version's "Contributors" lists the same rows in
        // the saved order, each with its "Author" badge, the "Primary
        // Contact" badge on the submitting author's row, and "Probe
        // Institute" under "Affiliations" in the first contributor's "Edit"
        // (Rule 1; Fields; the row's own line is A1, not read).
        let panel = await reloaded.openEditPanel('Greta Zeta');
        await reloaded.addTypedAffiliation(panel, 'Probe Institute');
        await reloaded.saveForm(panel);
        const version = await createNewVersion(page);
        await openPublicationPage(page, PK, submissionId, version.id, {
            entry: 'contributors',
            heading: 'Preprint: Contributors',
        });
        const copy = new ContributorsScreen(page);
        await expect(copy.panel()).toBeVisible({timeout: 30_000});
        await expect(copy.rows()).toHaveCount(2, {timeout: 30_000});
        await expect(copy.rows().first()).toContainText('Greta Zeta');
        await expect(copy.rows().nth(1)).toContainText('Alex Author');
        await expect(copy.roleBadge('Greta Zeta', 'Author')).toBeVisible();
        await expect(copy.roleBadge('Alex Author', 'Author')).toBeVisible();
        await expect(copy.primaryContactBadge('Alex Author')).toBeVisible();
        await expect(copy.primaryContactBadge('Greta Zeta')).toHaveCount(0);
        panel = await copy.openEditPanel('Greta Zeta');
        await expect(copy.affiliationRow(panel, 'Probe Institute')).toBeVisible({
            timeout: 30_000,
        });
        await copy.closePanel(panel);
    });

    test('S3: move the primary contact', async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s3', testInfo);
        // The Author is a throwaway account, for the mailbox read's scoping
        // (footnote s3, as s1).
        const author = `${tag}au`;
        await opsApi.createContext({tag, users: contextUsers(tag).slice(1)});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: PK,
            submitter: author,
            title: `Submission ${tag}`,
        });
        const gretaMail = mailOf(`${tag}g`);

        const page = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(page);
        let screen = await openContributors(page, PK, submissionId);
        await screen.addPersonContributor({
            given: 'Greta',
            family: 'Zeta',
            email: gretaMail,
        });
        await expect(screen.row('Greta Zeta')).toBeVisible({timeout: 30_000});
        const logBefore = await activityLogCounts(page);

        // "Set Primary Contact": the submitting author's row carries
        // "Primary Contact" while the other row offers "Set Primary
        // Contact"; pressed, the badge moves at once, with no confirmation
        // step — bounded by the publication PUT the panel sends (Rule 10).
        await expect(screen.primaryContactBadge('Ada Author')).toBeVisible({
            timeout: 30_000,
        });
        await expect(screen.setPrimaryContactButton('Greta Zeta')).toBeVisible();
        await screen.setPrimaryContact('Greta Zeta');
        await expect(screen.primaryContactBadge('Greta Zeta')).toBeVisible({
            timeout: 30_000,
        });
        await expect(screen.primaryContactBadge('Ada Author')).toHaveCount(0);
        await expect(screen.setPrimaryContactButton('Ada Author')).toBeVisible();
        // "With no confirmation": the click alone produced the publication
        // PUT `setPrimaryContact` waited on; a confirmation step would have
        // held it back (the Delete below, which does confirm, is the
        // positive control of that shape).

        // "The log and the mailbox": one new entry, "Submission metadata
        // updated" (Side effects); the mailbox is read at the end, once its
        // control is sent. The move persists on a fresh load.
        const logAfterMove = await activityLogCounts(page);
        expect(logAfterMove.rows).toBe(logBefore.rows + 1);
        expect(logAfterMove.metadataUpdated).toBe(logBefore.metadataUpdated + 1);
        screen = await openContributors(page, PK, submissionId);
        await expect(screen.primaryContactBadge('Greta Zeta')).toBeVisible({
            timeout: 30_000,
        });
        await expect(screen.setPrimaryContactButton('Ada Author')).toBeVisible();

        // "Deleting the primary contact": the remaining row still shows only
        // "Set Primary Contact" (Rules 5, 10; whether anything warned is A2,
        // not read; the publish dialog after it is A2's too).
        await screen.rowDeleteButton('Greta Zeta').click();
        await expect(screen.deleteContributorDialog()).toBeVisible({timeout: 30_000});
        await screen.confirmDelete('Greta Zeta');
        await expect(screen.setPrimaryContactButton('Ada Author')).toBeVisible({
            timeout: 30_000,
        });
        await expect(screen.primaryContactBadge('Ada Author')).toHaveCount(0);
        await expect(screen.rows()).toHaveCount(1);

        // "The last contributor": "Delete" on the remaining row: "No items
        // found." beneath the unchanged "Order", "Preview" and "Add
        // Contributor" buttons, and "Preview"'s three formats show nothing
        // (Rule 5).
        await screen.rowDeleteButton('Ada Author').click();
        await expect(screen.deleteContributorDialog()).toBeVisible({timeout: 30_000});
        await screen.confirmDelete('Ada Author');
        await expect(screen.emptyMessage()).toBeVisible({timeout: 30_000});
        await expect(screen.rows()).toHaveCount(0);
        await expect(screen.orderButton()).toBeVisible();
        await expect(screen.previewButton()).toBeVisible();
        await expect(screen.addContributorButton()).toBeVisible();
        await screen.openPreview();
        for (const format of ['Abbreviated', 'Publication Lists', 'Full']) {
            await expect(screen.previewRow(format)).toBeVisible();
            await expect(screen.previewValue(format)).toHaveText(/^\s*$/);
        }
        await screen.closePreview();

        // "Control": the deletes wrote nothing: the Activity Log still holds
        // the one "Submission metadata updated" entry from the move (Side
        // effects).
        const logAfterDeletes = await activityLogCounts(page);
        expect(logAfterDeletes).toEqual(logAfterMove);

        // The mailbox: no email arrived for the Author or the moved contact
        // (Side effects), bounded by a mail this test causes the same way
        // (A8).
        const afterControl = await sendMailControl({asUser, api: opsApi, tag});
        await pkpMail.expectNone({to: mailOf(author), afterControl});
        await pkpMail.expectNone({to: gretaMail, afterControl});
    });

    test('S4: record affiliations, typed and registry-backed', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
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
        const instA = `Probe Institute ${tag}`;
        // The registry record the browser-side search answers with (the
        // test supplies it: the public registry is never reached).
        const sfu = {
            match: /^Simon Fraser/,
            ror: 'https://ror.org/0213rcc28',
            name: 'Simon Fraser University',
            country: 'Canada',
        };

        const page = await (await asUser(`${tag}mg`)).newPage();
        await stubRegistrySearch(page);
        await ContributorsScreen.stubRegistryRecord(page, sfu);
        const screen = await openContributors(page, tag, submissionId);

        // "A typed institution": under "Affiliations", type the
        // institution, pick the typed text itself from the suggestions and
        // press "Add": it joins the list, with "Edit institution name" and
        // "Remove institution" behind its "Click to edit or delete" button
        // (Fields).
        let panel = await screen.openEditPanel('Ada Author');
        await expect(
            panel.getByText('Enter the full name of the institution below', {
                exact: false,
            })
        ).toBeVisible();
        // The seeded contributor arrives without a Country; the required
        // field must be completed before any save of this record (A16).
        await screen.input('country').selectOption({label: 'Canada'});
        await screen.addTypedAffiliation(panel, instA);
        await screen
            .affiliationRow(panel, instA)
            .getByRole('button', {name: 'Click to edit or delete'})
            .click();
        await expect(screen.affiliationRowMenuItems()).toHaveText([
            'Edit institution name',
            'Remove institution',
        ]);
        await closeMenu(page);

        // "The per-language names": "Edit institution name" opens one name
        // box per language, "Type the institution name in {language}", with
        // a "{count} of {total} languages completed" status (Fields; the
        // boxes' announced labels are A10's).
        const rowA = screen.affiliationRowAt(panel, 0);
        await expect(rowA).toContainText(instA);
        await expect(rowA.getByText('1 of 2 languages completed')).toBeVisible();
        await screen.openAffiliationRowAction(panel, instA, 'Edit institution name');
        const englishBox = screen.affiliationNameBox(rowA, 'English');
        // The second language's box carries no accessible name (A10), so it
        // is located by position.
        const frenchBox = screen.affiliationNameBoxes(rowA).nth(1);
        await expect(englishBox).toHaveValue(instA, {timeout: 10_000});
        await expect(frenchBox).toBeVisible();
        await expect(frenchBox).toHaveValue('');

        // "An empty primary-language name": the submission language's box
        // cleared and Save pressed: refused with "Please provide affiliation
        // name in the submission primary locale." under the field (the
        // foot's error list is A7's); the name typed back (Fields).
        await englishBox.fill('');
        await screen.saveButton(panel).click();
        await expect(screen.affiliationError(panel)).toHaveText(
            new RegExp(escapeRegExp(PRIMARY_LOCALE_NAME)),
            {timeout: 30_000}
        );
        await expect(panel).toBeVisible();
        await screen.affiliationNameBox(rowA, 'English').fill(instA);
        await expect(rowA).toContainText(instA);
        await expect(screen.saveButton(panel)).toBeEnabled({timeout: 10_000});

        // "A registry-backed institution": "Simon Fraser University" typed,
        // the suggestion showing its country and the ROR mark picked, "Add"
        // pressed: the entry's row links to the registry record and offers
        // only "Remove institution" (the typed entry's two items above are
        // the positive control). The test install cannot fetch the record
        // into its registry copy, and the error dialog that follows is A5's:
        // dismissed whenever it shows, never read either way.
        const errorDialog = page
            .getByRole('dialog')
            .filter({hasText: 'An unexpected error has occurred.'});
        await page.addLocatorHandler(errorDialog, async () => {
            await errorDialog.getByRole('button', {name: 'OK', exact: true}).click();
        });
        const suggestion = await screen.searchRegistry(panel, 'Simon Fraser University', sfu.ror);
        await expect(suggestion).toContainText(sfu.name);
        await expect(suggestion).toContainText(sfu.country);
        await expect(suggestion.locator(`a[href="${sfu.ror}"] svg`)).toBeAttached();
        await screen.addRegistryAffiliation(panel, suggestion);
        const rorRow = screen.registryAffiliationRow(panel, sfu.ror);
        await expect(rorRow).toBeVisible({timeout: 30_000});
        await rorRow.getByRole('button', {name: 'Click to edit or delete'}).click();
        await expect(screen.affiliationRowMenuItems()).toHaveText(['Remove institution']);
        await closeMenu(page);
        await expect(rorRow.locator('input[name="name"]')).toHaveCount(0);

        // "Both saved": Save the contributor and reopen "Edit": both
        // institutions are there (Rule 4; Fields).
        await screen.saveForm(panel);
        await page.removeLocatorHandler(errorDialog);
        panel = await screen.openEditPanel('Ada Author');
        await expect(screen.affiliationRow(panel, instA)).toBeVisible({
            timeout: 30_000,
        });
        await expect(screen.registryAffiliationRow(panel, sfu.ror)).toBeVisible();

        // "A refused "Edit" saves nothing": in the reopened "Edit", "Edit
        // institution name" on the typed institution, its submission-language
        // box cleared and Save pressed: refused with the same message under
        // the field; "Close" and a reload of the page: the contributor's
        // "Edit" lists the institution as before, its submission-language
        // box reading the name (Fields; Rule 4).
        const rowAgain = await screen.affiliationRowKept(panel, instA);
        await screen.openAffiliationRowAction(panel, instA, 'Edit institution name');
        await expect(screen.affiliationNameBox(rowAgain, 'English')).toHaveValue(instA, {
            timeout: 10_000,
        });
        await screen.affiliationNameBox(rowAgain, 'English').fill('');
        await screen.saveButton(panel).click();
        await expect(screen.affiliationError(panel)).toContainText(PRIMARY_LOCALE_NAME, {
            timeout: 30_000,
        });
        await expect(panel).toBeVisible();
        await screen.closePanel(panel);
        await screen.reload();
        panel = await screen.openEditPanel('Ada Author');
        const rowAfter = await screen.affiliationRowKept(panel, instA);
        await expect(screen.registryAffiliationRow(panel, sfu.ror)).toBeVisible();

        // "Control": the second language's name box stayed empty throughout
        // and no save was refused for it: the institution reopens, after
        // the accepted save above, at "1 of 2 languages completed" with the
        // second box empty; only the submission language's copy is ever
        // required (Fields).
        await expect(rowAfter.getByText('1 of 2 languages completed')).toBeVisible();
        await screen.openAffiliationRowAction(panel, instA, 'Edit institution name');
        await expect(screen.affiliationNameBoxes(rowAfter)).toHaveCount(2, {timeout: 10_000});
        await expect(screen.affiliationNameBox(rowAfter, 'English')).toHaveValue(instA);
        await expect(screen.affiliationNameBoxes(rowAfter).nth(1)).toHaveValue('');
        // The row's menu is gone while its name boxes are open; the panel is
        // closed (saving nothing, as above) and reopened for the removal.
        await screen.closePanel(panel);
        panel = await screen.openEditPanel('Ada Author');
        await expect(screen.affiliationRow(panel, instA)).toBeVisible({timeout: 30_000});

        // "Removing one": "Remove institution" on the typed institution:
        // "Are you sure?" — "The affiliation {name} will be deleted."; "Yes"
        // removes it (Fields).
        await screen.openAffiliationRowAction(panel, instA, 'Remove institution');
        const confirm = screen.affiliationDeleteDialog();
        await expect(confirm).toBeVisible({timeout: 30_000});
        await expect(confirm).toContainText('Are you sure?');
        await expect(confirm).toContainText(`The affiliation ${instA} will be deleted.`);
        await confirm.getByRole('button', {name: 'Yes', exact: true}).click();
        await expect(confirm).toHaveCount(0, {timeout: 30_000});
        await expect(screen.affiliationRow(panel, instA)).toHaveCount(0, {
            timeout: 10_000,
        });
        await expect(screen.registryAffiliationRow(panel, sfu.ror)).toBeVisible();
        await screen.closePanel(panel);
    });

    test('S5: manage the server\'s contributor roles', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
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

        // "The Contributor Roles screen": the table lists the preprint
        // server's starting pair (Rule 11).
        let settings = await openContributorRolesSettings(page, tag);
        const authorRow = settings.locator('tr').filter({hasText: 'AUTHOR'}).first();
        await expect(authorRow).toContainText('Author');
        await expect(
            settings.locator('tr').filter({hasText: 'TRANSLATOR'})
        ).toContainText('Translator');

        // "Add Role": pick identifier EDITOR, name it ("Fill name in all
        // of the languages."), Save — "Contributor role saved" and the
        // row appears (Rule 12; Fields).
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

        // "Edit Role": "Edit" behind the new row's "…" menu: the Role
        // Identifier drop-down offers only EDITOR, the role's own identifier
        // (Rule 12; Fields). The positive control is the "Add Role" list
        // above, which offered the whole set.
        await newRoleRow.getByRole('button', {name: 'More Actions'}).click();
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const editRole = page.getByRole('dialog', {name: 'Edit Role'});
        await expect(editRole).toBeVisible({timeout: 30_000});
        const identifier = editRole.getByRole('combobox', {name: /^Role Identifier/});
        await expect(identifier).toHaveValue('EDITOR');
        await expect(identifier.locator('option')).toHaveCount(1);
        await expect(identifier.locator('option')).toHaveText(['EDITOR']);
        await expect(editRole.getByRole('textbox', {name: /^Role Name/})).toHaveValue(
            roleName
        );
        await editRole.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(editRole).toHaveCount(0, {timeout: 30_000});

        // "The role in use": on the submission, tick the new role on a
        // contributor — its badge joins the row.
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

        // "The deletion": untick the role on the contributor, then delete
        // it for real: "Role Deleted" confirms (Rule 13). This is also the
        // "Control": the new role, once no contributor held it, went through
        // the same dialog to "Role Deleted".
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

        // "The last AUTHOR role": "Delete Role" on "Author" while the seeded
        // contributor still holds it: BOTH preconditions would refuse, and
        // the in-use refusal is the one shown (Rule 13's precedence).
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

        // The Given, built through the panel (footnote s6): the first
        // contributor gets a typed affiliation, a Bio Statement, a second
        // role and the CRediT role "Conceptualization" at "Lead"; a second
        // contributor is added.
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await stubRegistrySearch(managerPage);
        const screen = await openContributors(managerPage, tag, submissionId);
        let panel = await screen.openEditPanel('Ada Author');
        // The seeded contributor arrives without a Country (required).
        await screen.input('country').selectOption({label: 'Canada'});
        await screen.addTypedAffiliation(panel, instName);
        await screen.fillRichText('biography', 'en', bioText);
        await screen.roleCheckbox(panel, 'Translator').check();
        const creditRow = await screen.addCreditRole(panel, {degree: 'Lead'});
        await expect(creditRow.locator('select[name="role"]')).toHaveValue(/conceptualization/);
        await screen.saveForm(panel);
        await screen.addPersonContributor({
            given: 'Greta',
            family: 'Zeta',
            email: mailOf(`${tag}g`),
        });
        await expect(screen.row('Greta Zeta')).toBeVisible({timeout: 30_000});
        // "Control": in the workflow, the item's "Contributors" list shows
        // the "Primary Contact" badge on the submitting author's row, the
        // choice readers never see (Rules 3, 10) — the positive control of
        // the "No contact mark" reads below.
        await expect(screen.primaryContactBadge('Ada Author')).toBeVisible();
        await expect(screen.primaryContactBadge('Greta Zeta')).toHaveCount(0);

        // "The landing page": the authors block credits both in list order:
        // names, the affiliation name, each contributor's role names, and
        // the first contributor's CRediT role with its degree (Rule 14;
        // Fields).
        await page.goto(`/index.php/${tag}/preprint/view/${submissionId}`);
        const authorsBlock = page.locator('.item.authors');
        const authorItems = authorsBlock.locator('li');
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
        await expect(authorItems.first().locator('.credit_roles')).toContainText(
            /Conceptualization\s*\(Lead\)/
        );
        await expect(authorItems.nth(1)).toContainText('Greta Zeta');
        await expect(authorItems.nth(1).locator('.contributor_roles')).toContainText(
            'Author'
        );
        await expect(authorItems.nth(1)).not.toContainText('Conceptualization');

        // "Author Biography": "{name}, {affiliations}" above the statement
        // (Rule 14 — one biography, singular heading).
        const bios = page.locator('.item.author_bios');
        await expect(bios.getByRole('heading', {name: 'Author Biography'})).toBeVisible();
        await expect(bios.locator('div.label')).toContainText('Ada Author,');
        await expect(bios.locator('div.label')).toContainText(instName);
        await expect(bios).toContainText(bioText);

        // "No contact mark" on the landing page (Rule 10): neither
        // contributor is marked as the primary contact.
        await expect(authorsBlock).toContainText('Greta Zeta');
        await expect(authorsBlock).not.toContainText('Primary Contact');

        // "A listing": the archive listing shows the author line in the
        // "Full" format — names with roles in parentheses (Rule 15; role
        // order inside the parentheses is not part of the assertion) — and
        // no contact mark there either (Rule 10).
        await page.goto(`/index.php/${tag}/preprints`);
        const summary = page.locator('.obj_preprint_summary').filter({hasText: title});
        await expect(summary).toBeVisible({timeout: 30_000});
        const authorLine = summary.locator('.authors');
        await expect(authorLine).toContainText('Ada Author (');
        await expect(authorLine).toContainText('Translator');
        await expect(authorLine).toContainText('Greta Zeta (Author)');
        await expect(summary).not.toContainText('Primary Contact');
    });

    test('S7: keep a contributor out of publication lists', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
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
            email: mailOf(`${tag}g`),
        });
        await expect(screen.row('Greta Zeta')).toBeVisible({timeout: 30_000});
        // The submitting author leads the list (Rule 6's append-at-end), so
        // "the first contributor" below is Alex Author and "the second"
        // Greta Zeta.
        await expect(screen.rows().first()).toContainText('Alex Author');
        await expect(screen.rows().nth(1)).toContainText('Greta Zeta');
        // The seeded contributor arrives without a Country (A16), and every
        // save of it is refused until one is chosen; scenario 6's first
        // contributor, which this Given stands for, has one.
        let panel = await screen.openEditPanel('Alex Author');
        await screen.input('country').selectOption({label: 'Canada'});
        await screen.saveForm(panel);

        // "Save" with nothing changed: the first contributor's "Edit" saved
        // as it opens; after a reload the list still shows that contributor
        // first, and the landing page, signed out, still credits it first
        // (Rule 6).
        panel = await screen.openEditPanel('Alex Author');
        await expect(screen.input('givenName', 'en')).toHaveValue('Alex');
        await screen.saveForm(panel);
        await screen.reload();
        await expect(screen.rows()).toHaveCount(2);
        await expect(screen.rows().first()).toContainText('Alex Author');
        await expect(screen.rows().nth(1)).toContainText('Greta Zeta');
        await page.goto(
            `/index.php/${PK}${PK_PREFIX}/preprint/view/${submissionId}`
        );
        const landingAuthors = page.locator('.item.authors li');
        await expect(landingAuthors).toHaveCount(2, {timeout: 30_000});
        await expect(landingAuthors.first()).toContainText('Alex Author');
        await expect(landingAuthors.nth(1)).toContainText('Greta Zeta');

        // "Control": before any untick, "Publication Lists" and "Full" read
        // the same names and roles (Rule 7).
        await screen.openPreview();
        await expect(screen.previewValue('Full')).toContainText('Alex Author (Author)', {timeout: 30_000});
        await expect(screen.previewValue('Full')).toContainText('Greta Zeta (Author)');
        const before = await screen.previewValue('Full').innerText();
        await expect(screen.previewValue('Publication Lists')).toHaveText(before);
        await expect(screen.previewValue('Abbreviated')).toHaveText('Author et al.');
        await screen.closePreview();

        // "The untick": "Publication Lists" unticked on the second
        // contributor (the checkbox arrives ticked — Fields): "Preview" now
        // omits them from the "Publication Lists" row while "Full" keeps
        // them (Rule 8).
        panel = await screen.openEditPanel('Greta Zeta');
        let tick = screen.includeInBrowseCheckbox(panel);
        await expect(tick).toBeChecked();
        await tick.uncheck();
        await screen.saveForm(panel);
        await screen.openPreview();
        const listsRow = screen.previewRow('Publication Lists');
        await expect(listsRow).toContainText('Alex Author');
        await expect(listsRow).not.toContainText('Greta Zeta');
        const fullRow = screen.previewRow('Full');
        await expect(fullRow).toContainText('Alex Author (Author)');
        await expect(fullRow).toContainText('Greta Zeta (Author)');
        await screen.closePreview();

        // "The reader pages": the landing page still credits both (Rules 8,
        // 14; the archive's treatment of the tick is A3, not read).
        await page.goto(
            `/index.php/${PK}${PK_PREFIX}/preprint/view/${submissionId}`
        );
        const authorItems = page.locator('.item.authors li');
        await expect(authorItems.filter({hasText: 'Alex Author'})).toBeVisible({
            timeout: 30_000,
        });
        await expect(authorItems.filter({hasText: 'Greta Zeta'})).toBeVisible();

        // "Abbreviated" ignores the tick: the second contributor re-ticked,
        // the first unticked the same way: "Publication Lists" now omits the
        // first, while "Abbreviated" still reads the first contributor's
        // family name plus "et al." (Rule 8).
        panel = await screen.openEditPanel('Greta Zeta');
        tick = screen.includeInBrowseCheckbox(panel);
        await expect(tick).not.toBeChecked();
        await tick.check();
        await screen.saveForm(panel);
        panel = await screen.openEditPanel('Alex Author');
        tick = screen.includeInBrowseCheckbox(panel);
        await expect(tick).toBeChecked();
        await tick.uncheck();
        await screen.saveForm(panel);
        await screen.openPreview();
        await expect(screen.previewValue('Publication Lists')).toContainText('Greta Zeta (Author)');
        await expect(screen.previewValue('Publication Lists')).not.toContainText('Alex Author');
        await expect(screen.previewValue('Full')).toContainText('Alex Author (Author)');
        await expect(screen.previewValue('Abbreviated')).toHaveText('Author et al.');
        await screen.closePreview();
    });

    test('S8: require competing interests', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
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
        const ciGuidance =
            'Please disclose any competing interests this author may have with the research subject.';
        const settingBox = (settings) =>
            settings.getByRole('checkbox', {
                name: /Require submitting Authors to file a Competing Interest/,
            });

        const page = await (await asUser(`${tag}mg`)).newPage();
        await stubRegistrySearch(page);

        // "Control": before the tick, the same contributor's form has no
        // "Competing Interests" field (Settings; Fields) — the Bio Statement
        // field beside it is the positive control.
        let screen = await openContributors(page, tag, submissionId);
        let panel = await screen.openEditPanel('Ada Author');
        await expect(
            panel.getByText('Bio Statement (e.g., department and rank)', {exact: true})
        ).toBeVisible();
        await expect(panel.getByText(ciGuidance)).toHaveCount(0);
        await expect(
            page.locator(`iframe#${screen.controlId('competingInterests', 'en')}_ifr`)
        ).toHaveCount(0);
        await screen.closePanel(panel);

        // "The setting": tick the requirement on the workflow settings'
        // Metadata screen and save: editing any contributor now shows a
        // required "Competing Interests" field (Settings; Fields).
        let settings = await openMetadataSettings(page, tag);
        await expect(settingBox(settings)).not.toBeChecked();
        await settingBox(settings).check();
        await saveSettingsPanel(page, settings);

        screen = await openContributors(page, tag, submissionId);
        panel = await screen.openEditPanel('Ada Author');
        // The field is asserted by its guidance sentence and its editor —
        // not its label: on a preprint server the label renders raw markup
        // (OPS2, never asserted).
        await expect(panel.getByText(ciGuidance)).toBeVisible();
        await expect(
            page.locator(`iframe#${screen.controlId('competingInterests', 'en')}_ifr`)
        ).toBeVisible();

        // "An empty statement": Save with it empty is refused on the form:
        // "This field is required." in red under the field, and "Please
        // correct one error." at the foot (Fields).
        // The seeded contributor arrives without a Country; complete the
        // required field first so the refusal under test is the empty
        // statement alone ("Please correct one error." — singular).
        await screen.input('country').selectOption({label: 'Canada'});
        await screen.saveButton(panel).click();
        await expect(screen.errorSummary(panel)).toHaveText(/Please correct one error\./, {
            timeout: 30_000,
        });
        await expect(screen.fieldError(panel, 'competingInterests', 'en')).toHaveText(
            REQUIRED
        );

        // "A statement": typed, Save: the panel closes (Rule 4; Fields).
        await screen.fillRichText('competingInterests', 'en', ciText);
        await screen.saveForm(panel);

        // "The setting off": unticked, the field is gone from the form
        // (Settings; the Bio Statement field still renders).
        settings = await openMetadataSettings(page, tag);
        await settingBox(settings).uncheck();
        await saveSettingsPanel(page, settings);

        screen = await openContributors(page, tag, submissionId);
        panel = await screen.openEditPanel('Ada Author');
        await expect(
            panel.getByText('Bio Statement (e.g., department and rank)', {exact: true})
        ).toBeVisible();
        await expect(panel.getByText(ciGuidance)).toHaveCount(0);
        await expect(
            page.locator(`iframe#${screen.controlId('competingInterests', 'en')}_ifr`)
        ).toHaveCount(0);
        await screen.closePanel(panel);

        // "The setting on again": ticked again, the contributor's "Edit"
        // shows the "Competing Interests" field back with the statement
        // intact (Settings).
        settings = await openMetadataSettings(page, tag);
        await settingBox(settings).check();
        await saveSettingsPanel(page, settings);

        screen = await openContributors(page, tag, submissionId);
        panel = await screen.openEditPanel('Ada Author');
        await expect(panel.getByText(ciGuidance)).toBeVisible();
        await expect(screen.richTextBody('competingInterests', 'en')).toContainText(ciText, {
            timeout: 30_000,
        });
    });

    test('S9: the read-only list, editable on a preprint server', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s9', testInfo);
        // The Author's own submitted, not-yet-posted preprint, and a second,
        // not yet submitted draft of the same Author (footnote s9).
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });
        const draft = await opsApi.createSubmission({
            tag: `${tag}d`,
            context: PK,
            submitter: 'author.alex',
            title: `Draft ${tag}`,
            submitted: false,
        });

        // The second contributor is added through the panel by the manager,
        // who is also the "Control": their "Contributors" on the same
        // submission shows "Order", "Preview" and "Add Contributor" above
        // the rows, and each row's "Primary Contact" or "Set Primary
        // Contact", "Edit" and "Delete" (Rules 2, 3).
        const managerPage = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(managerPage);
        const managerScreen = await openContributors(managerPage, PK, submissionId);
        await managerScreen.addPersonContributor({
            given: 'Greta',
            family: 'Zeta',
            email: mailOf(`${tag}g`),
        });
        await expect(managerScreen.row('Greta Zeta')).toBeVisible({timeout: 30_000});
        await expectEditableList(managerScreen, {contact: 'Alex Author', others: ['Greta Zeta']});

        // "A preprint server": the submitting author's list on their own
        // not-yet-posted preprint carries the full controls (OPS1; Actors
        // row 2): "Order", "Preview" and "Add Contributor" above the rows,
        // and "Primary Contact" or "Set Primary Contact", "Edit" and
        // "Delete" on each row; the rows show names and role badges.
        const authorPage = await (await asUser('author.alex')).newPage();
        await stubRegistrySearch(authorPage);
        let screen = await openContributors(authorPage, PK, submissionId, {author: true});
        await expectEditableList(screen, {contact: 'Alex Author', others: ['Greta Zeta']});
        await expect(screen.roleBadge('Alex Author', 'Author')).toBeVisible();
        await expect(screen.roleBadge('Greta Zeta', 'Author')).toBeVisible();
        await expect(screen.addContributorButton()).toBeEnabled();
        await expect(screen.orderButton()).toBeEnabled();

        // "Preview": "List of Contributors" opens with its "Abbreviated",
        // "Publication Lists" and "Full" rows (Rule 7).
        const preview = await screen.openPreview();
        await expect(preview.getByText('List of Contributors')).toBeVisible();
        await expect(screen.previewRow('Abbreviated')).toContainText('Author et al.');
        await expect(screen.previewRow('Publication Lists')).toContainText('Greta Zeta (Author)');
        await expect(screen.previewRow('Full')).toContainText('Alex Author (Author)');
        await screen.closePreview();

        // The controls work for the author (OPS1's substance): an added
        // contributor and an edit made through them persist on a fresh load
        // of their own view.
        await screen.addPersonContributor({
            given: 'Hana',
            family: 'Nova',
            email: mailOf(`${tag}h`),
        });
        await expect(screen.row('Hana Nova')).toBeVisible({timeout: 30_000});
        await expect(screen.setPrimaryContactButton('Hana Nova')).toBeVisible();
        const panel = await screen.openEditPanel('Hana Nova');
        await screen.input('familyName', 'en').fill('Novak');
        await screen.saveForm(panel);
        await expect(screen.row('Hana Novak')).toBeVisible({timeout: 30_000});
        screen = await openContributors(authorPage, PK, submissionId, {author: true});
        await expect(screen.row('Hana Novak')).toBeVisible({timeout: 30_000});
        await expect(screen.rowEditButton('Hana Novak')).toBeVisible();

        // "The wizard's Contributors step": the draft opened in the
        // submission wizard, its Contributors step: the same list, with
        // "Order", "Preview" and "Add Contributor" above the rows and
        // "Edit" and "Delete" on the row, editable as always there (Actors
        // row 3; Cross-feature interactions).
        await authorPage.goto(wizardUrl(PK, draft.submissionId));
        await expectWizardOpen(authorPage);
        await continueTo(authorPage, STEPS.details);
        await continueTo(authorPage, STEPS.contributors);
        const wizardList = new ContributorsScreen(authorPage, {
            root: authorPage.locator('.listPanel--contributor'),
        });
        await expect(wizardList.panel()).toBeVisible({timeout: 30_000});
        await expect(wizardList.rows()).toHaveCount(1);
        await expectEditableList(wizardList, {contact: 'Alex Author', others: []});
        await expect(wizardList.roleBadge('Alex Author', 'Author')).toBeVisible();
    });

    test('S12: a contributor edited by a program', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s12', testInfo);
        // The second contributor "Robin Okafor" is seeded (`contributors[]`,
        // country CA by default); its typed institution is added through
        // its "Edit", no seed key existing for affiliations (footnote s12).
        const seeded = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            contributors: [{givenName: 'Robin', familyName: 'Okafor', email: 'robin@example.test'}],
        });
        const address = {
            contextPath: PK,
            submissionId: seeded.submissionId,
            publicationId: seeded.publicationId,
            contributorId: seeded.contributors[0].id,
        };
        const institution = `Probe Institute ${tag}`;

        const page = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(page);
        const screen = await openContributors(page, PK, seeded.submissionId);
        await expect(screen.rows().nth(1)).toContainText('Robin Okafor', {timeout: 30_000});
        let panel = await screen.openEditPanel('Robin Okafor');
        await screen.addTypedAffiliation(panel, institution);
        await screen.saveForm(panel);

        /** The contributor's "Edit" after a reload: its email and country. */
        const expectEditShows = async (name, {email, institutionShown}) => {
            await screen.reload();
            await expect(screen.row(name)).toBeVisible({timeout: 30_000});
            const editPanel = await screen.openEditPanel(name);
            await expect(screen.input('email')).toHaveValue(email, {timeout: 30_000});
            await expect(screen.input('country')).toHaveValue('CA');
            await expect(screen.input('country').locator('option:checked')).toHaveText('Canada');
            if (institutionShown) {
                await expect(screen.affiliationRow(editPanel, institution)).toBeVisible();
            }
            await screen.closePanel(editPanel);
        };

        // "An edit that resends the affiliations": the program's edit names
        // the type PERSON and carries "Dana" as the given name and the
        // affiliations as it read them; after a reload the row reads "Dana
        // Okafor", and its "Edit" still shows the email, "Canada" and the
        // institution under "Affiliations" (Rule 4a).
        const read = await screen.readContributorThroughApi(address);
        expect(read.affiliations).toHaveLength(1);
        expect(read.affiliations[0].name.en).toBe(institution);
        let answer = await screen.editContributorThroughApi(address, {
            contributorType: 'PERSON',
            givenName: {en: 'Dana'},
            affiliations: read.affiliations,
        });
        expect(answer.status()).toBe(200);
        await expectEditShows('Dana Okafor', {email: 'robin@example.test', institutionShown: true});
        await expect(screen.row('Robin Okafor')).toHaveCount(0);

        // "An edit of the given name alone": the type PERSON and only "Kim"
        // as the given name: after a reload the row reads "Kim Okafor", and
        // its "Edit" still shows the email and "Canada"; the institution is
        // not read (A30) (Rule 4a).
        answer = await screen.editContributorThroughApi(address, {
            contributorType: 'PERSON',
            givenName: {en: 'Kim'},
        });
        expect(answer.status()).toBe(200);
        await expectEditShows('Kim Okafor', {email: 'robin@example.test', institutionShown: false});
        await expect(screen.row('Dana Okafor')).toHaveCount(0);

        // "The type sent empty": the contributor type empty and
        // "kim@example.test" as the email: the answer refuses the edit with
        // "This field is required." for the contributor type; after a
        // reload the row still reads "Kim Okafor" and its "Edit" still
        // shows the old email (Rule 4a).
        answer = await screen.editContributorThroughApi(address, {
            contributorType: null,
            email: 'kim@example.test',
        });
        expect(answer.status()).toBe(400);
        expect(await answer.json()).toEqual({contributorType: [REQUIRED]});
        await expectEditShows('Kim Okafor', {email: 'robin@example.test', institutionShown: false});

        // "Control": the same edit naming the type PERSON goes through:
        // after a reload the contributor's "Edit" shows "kim@example.test",
        // and the row still reads "Kim Okafor" (Rule 4a).
        answer = await screen.editContributorThroughApi(address, {
            contributorType: 'PERSON',
            email: 'kim@example.test',
        });
        expect(answer.status()).toBe(200);
        await expectEditShows('Kim Okafor', {email: 'kim@example.test', institutionShown: false});
        await expect(screen.rows()).toHaveCount(2);
    });

    test('S13: role names in the reader\'s language', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s13', testInfo);
        // A scratch server whose primary language is English, French ticked
        // under "UI" and "Forms", one posted preprint whose one contributor,
        // its submitting author, holds "Author" (footnote s13). The reader
        // is the fixture's signed-out page; the archive holds only this
        // preprint.
        await opsApi.createContext({
            tag,
            context: {
                primaryLocale: 'en',
                supportedLocales: ['en', 'fr_CA'],
                supportedFormLocales: ['en', 'fr_CA'],
            },
            users: contextUsers(tag),
        });
        const title = `Submission ${tag}`;
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title,
            published: true,
        });

        /** The landing page's role names and the archive's author line, in one language. */
        const readPages = async (locale, role) => {
            await page.goto(`/index.php/${tag}/${locale}/preprint/view/${submissionId}`);
            const credits = page.locator('.item.authors li');
            await expect(credits).toHaveCount(1, {timeout: 30_000});
            await expect(credits.locator('.name')).toHaveText('Ada Author');
            await expect(credits.locator('.contributor_roles')).toHaveText(role);
            await page.goto(`/index.php/${tag}/${locale}/preprints`);
            const summary = page.locator('.obj_preprint_summary').filter({hasText: title});
            await expect(summary).toBeVisible({timeout: 30_000});
            await expect(summary.locator('.authors')).toHaveText(`Ada Author (${role})`);
        };

        // "The French pages before": browsing in French, the landing page
        // credits the contributor with "Author" and the archive reads "Ada
        // Author (Author)" (Rule 15a; A21); "Control", before the save: the
        // English pages read the same.
        await readPages('fr_CA', 'Author');
        await expect(page.locator('html')).toHaveAttribute('lang', /^fr/);
        await readPages('en', 'Author');

        // "Edit Role": "Edit" behind the "Author" row's "…" menu: the "Role
        // Name" box shows "Author" with "1/2 languages completed" under it;
        // "French" pressed: the box "Role Name in French" shows, empty, with
        // "1/2 languages completed" under it (Fields "Role Name"; A21).
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        const settings = await openContributorRolesSettings(managerPage, tag);
        const authorRow = settings.locator('tr').filter({hasText: 'AUTHOR'}).first();
        const editRole = managerPage.getByRole('dialog', {name: 'Edit Role'});
        const openEditRole = async () => {
            await authorRow.getByRole('button', {name: 'More Actions'}).click();
            await managerPage.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            await expect(editRole).toBeVisible({timeout: 30_000});
        };
        const nameBox = editRole.getByRole('textbox', {name: /^Role Name/}).first();
        const frenchBox = editRole.getByRole('textbox', {name: 'Role Name in French', exact: true});
        const completed = editRole
            .getByText('1/2 languages completed', {exact: true})
            .filter({visible: true});
        await openEditRole();
        await expect(nameBox).toHaveValue('Author');
        await expect(completed).toHaveCount(1);
        await expect(frenchBox).toBeHidden();
        await editRole.getByRole('button', {name: 'French', exact: true}).click();
        await expect(frenchBox).toBeVisible();
        await expect(frenchBox).toHaveValue('');
        await expect(completed).toHaveCount(2);

        // "Close": "Auteur-e" typed in the French box and "Close" pressed:
        // the window shuts at once, with no question (no dialog left on the
        // settings page; the window itself was the positive control); after
        // a reload the "Author" row's "Edit" › "French" shows the box empty
        // (Rule 12; the window reopened before the reload is A22's).
        await frenchBox.fill('Auteur-e');
        await editRole.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(editRole).toHaveCount(0, {timeout: 30_000});
        await expect(managerPage.getByRole('dialog')).toHaveCount(0);
        await managerPage.reload();
        await managerPage.locator('#contributorRoles-button').click();
        await expect(
            settings.getByRole('button', {name: 'Add Role', exact: true})
        ).toBeVisible({timeout: 30_000});
        await openEditRole();
        await expect(nameBox).toHaveValue('Author');
        await editRole.getByRole('button', {name: 'French', exact: true}).click();
        await expect(frenchBox).toBeVisible();
        await expect(frenchBox).toHaveValue('');

        // "The French name saved": "Auteur-e" typed and Save pressed:
        // "Contributor role saved" appears (Rule 12).
        await frenchBox.fill('Auteur-e');
        const roleSaved = managerPage.waitForResponse(
            (r) =>
                r.url().includes('/contributorRoles') &&
                ['POST', 'PUT'].includes(r.request().method()) &&
                r.ok(),
            {timeout: 30_000}
        );
        await editRole.getByRole('button', {name: 'Save', exact: true}).click();
        await roleSaved;
        await expect(managerPage.getByText('Contributor role saved')).toBeVisible({
            timeout: 30_000,
        });

        // "The French pages after": the landing page credits "Auteur-e" and
        // the archive reads "Ada Author (Auteur-e)" (Rule 15a); "Control",
        // after the save: the English pages still read "Author".
        await readPages('fr_CA', 'Auteur-e');
        await readPages('en', 'Author');
        await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
    });
});
