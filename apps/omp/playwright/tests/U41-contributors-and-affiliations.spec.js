// @ts-check
/**
 * @file playwright/tests/U41-contributors-and-affiliations.spec.js
 *
 * Contributors & affiliations — OMP suite: one test per canonical scenario
 * the spec runs on a press (S1–S9 common, S10 press-only, S11 {OJS OMP}),
 * in the press's own vocabulary: Press Manager, monograph, catalog book
 * page, catalog list. The press markers ride inside the common tests: the
 * FOUR seeded press contributor roles and the press-flavored last-AUTHOR
 * leg (S5), the catalog list honoring the publication-lists tick (S7, the
 * rule's clean side; A3 🐞 is the journal's and the preprint server's),
 * the five-contributor book page compacting to one names-only line
 * (OMP1 ✅, S6's second monograph), the Edited Volume's "(ed)" credit
 * (OMP2 ✅, S10) and the author's read-only workflow list (S9; the
 * editable author is the preprint server's OPS1). S11 reads the reviewer
 * page's own publication fetch, never a request the screens would not
 * send (the Frame). S3's publish dialog is the press's: the header button
 * reads "Publish" and opens the "Schedule For Publication" window at once
 * (Rule 2's OMP leg in *Publish, schedule & versions*), so the journal's
 * "Review Publishing Details" step of the spec's sentence has no press end.
 * Spec: docs/specs/U41-contributors-and-affiliations.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 🐞
 * (the row never shows affiliations: nothing asserts the row's affiliation
 * line either way, and S6's five contributors carry none), A2 ❓ (S3
 * asserts the publish dialog's own sentence, never its silence about the
 * missing contact), A3 🐞 (journal/preprint-only), A5 🐞 (every affiliation
 * takes the typed-name path; the browser-side registry query is stubbed
 * to an empty result set, ContributorPages.stubRegistrySearch), A6 ❓ (S9
 * asserts the scenario's own sentence, the badge absent on the read-only
 * list), A7 🐞 (S4 asserts the inline refusal only, never the foot
 * summary), A9/A10 🐞 (the boxes are located structurally, not by their
 * accessible names), A11 ❓, A12 🐞 (S5 reaches the confirm button by a
 * /delete/i name match), A4 ❓, A8 ❓, A13 ❓, A14 🐞, A16 🐞 (the seeded
 * contributor's missing Country is filled once before any edit, never
 * asserted), A17 ❓, A18 ❓, OPS1 ✅ and OPS2 🐞 (preprint-only). The spec's
 * Coverage section records everything else left out.
 *
 * Seeding: scenario endpoints only. S2, S9 and S10's book pages run on the
 * seeded press with the ready accounts and only add their own tagged
 * submissions and contributors; S1 and S3 read a mailbox scoped to the
 * submitter's address (footnote s1), so like U40's S1 they run on a
 * scratch press with throwaway users whose addresses carry app + test
 * (u41s1ompw0…@mail.test) rather than enrolling a throwaway author in
 * publicknowledge; every other test seeds its own scratch press because it
 * changes press settings or roles, publishes, or reads a reviewer's
 * assignment. publicknowledge and the 18 seeded users are never changed
 * (A1, A7). There is no contributor seeding key — the add/edit panel IS
 * the surface under test, so contributors beyond the auto-created
 * submitter are always recorded through it. Every absence is a settled
 * read paired with a positive control taken the same way; a mailbox
 * silence is bounded by a discussion email the test itself sends to a
 * second throwaway author (A8, `pkpMail.expectNone`); an Activity Log
 * silence is a count read before and after, bounded by the test's own
 * "Set Primary Contact" writing its one line. Waits are event-based
 * (contributors/publication API responses, web-first assertions) — no
 * hard-coded sleeps. Everything runs in the parallel `omp` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {
    ContributorsScreen,
    stubRegistrySearch,
} = require('../pages/ContributorPages.js');
const {
    expectWizardOpen,
    continueTo,
} = require('../pages/SubmissionWizardPages.js');
const {
    ReviewerAssignmentsPage,
} = require('../../../../shared/playwright/pages/ReviewerPages.js');

const PK = 'publicknowledge';
const PK_PREFIX = '/en';
const METADATA_UPDATED = 'Submission metadata updated';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u41${scenario}ompw${testInfo.parallelIndex}${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}

/** Open a monograph's workflow view (editorial or author dashboard). */
async function openWorkflow(page, contextPath, submissionId, {author = false} = {}) {
    const dashboard = author ? 'mySubmissions' : 'editorial';
    await page.goto(
        `/index.php/${contextPath}/dashboard/${dashboard}?workflowSubmissionId=${submissionId}`
    );
}

/**
 * Open a monograph's workflow view, then its Contributors screen; with
 * `publicationId` the version's own page straight by address through the
 * app's workflowMenuKey (`publication_{id}_contributors`).
 */
async function openContributors(
    page,
    contextPath,
    submissionId,
    {author = false, publicationId = null} = {}
) {
    const screen = new ContributorsScreen(page);
    if (publicationId) {
        const dashboard = author ? 'mySubmissions' : 'editorial';
        await page.goto(
            `/index.php/${contextPath}/dashboard/${dashboard}?workflowSubmissionId=${submissionId}&workflowMenuKey=publication_${publicationId}_contributors`
        );
        await expect(
            page.getByRole('heading', {name: 'Publication: Contributors'})
        ).toBeVisible({timeout: 30_000});
        return screen;
    }
    await openWorkflow(page, contextPath, submissionId, {author});
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

/** A catalog list entry's author line, by the book's title. */
function catalogAuthorLine(page, title) {
    return page.locator('.obj_monograph_summary').filter({hasText: title}).locator('.author');
}

/** A scratch press user spec. */
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
 * A scratch press with a manager and an author (U40/U43 shape); `other`
 * adds a second author (the mailbox control's recipient), `reviewer` an
 * external reviewer, `review` the Review settings passthrough.
 */
function scratchPressSpec(tag, {locales, other = false, reviewer = false, review} = {}) {
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
        ...(review ? {review} : {}),
        users: [
            scratchUser(tag, 'mg', 'Mona', 'Manager', ['manager']),
            scratchUser(tag, 'au', 'Ada', 'Author', ['author']),
            ...(other ? [scratchUser(tag, 'ob', 'Bea', 'Other', ['author'])] : []),
            ...(reviewer ? [scratchUser(tag, 'rv', 'Rex', 'Reviewer', ['externalReviewer'])] : []),
        ],
    };
}

/**
 * Pin a two-row contributor list's order so {firstName} leads, through the
 * screen's own ordering mode. For determinism: "Save Order" persists an
 * explicit sequence for every row, so the callers' ordering assertions
 * hold by construction instead of depending on insertion order (footnote
 * s2: belt-and-braces since A15's retirement).
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

/**
 * Open the workflow header's "Activity Log" window and return its rows
 * carrying `text` (Activity Log & Notes → History; the caller counts or
 * reads them, then closes the window with closeActivityLog).
 */
async function activityLogRows(page, text) {
    await page.getByRole('button', {name: 'Activity Log', exact: true}).click();
    const log = page.getByRole('dialog', {name: /Activity Log/});
    await expect(log.getByText('Event', {exact: true})).toBeVisible({timeout: 30_000});
    // The seeded submission's own lines make the table non-empty, so a
    // count read is bounded by the first data row having rendered.
    await expect(log.getByRole('row').nth(1)).toBeVisible({timeout: 30_000});
    return log.getByRole('row').filter({hasText: text});
}

async function closeActivityLog(page) {
    const log = page.getByRole('dialog', {name: /Activity Log/});
    await log.getByRole('button', {name: 'Close', exact: true}).first().click();
    await expect(log).toHaveCount(0, {timeout: 30_000});
}

/** The Activity Log's count of `text` lines, the window closed again. */
async function readLogCount(page, text) {
    const rows = await activityLogRows(page, text);
    const count = await rows.count();
    await closeActivityLog(page);
    return count;
}

/**
 * Add a discussion on the open workflow's stage panel with one participant
 * ticked (the participant gets the "new discussion" email: the mailbox
 * bullets' positive control, A8). U40's shape.
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

/**
 * "Create New Version" from the open workflow's Publication group, confirmed
 * untouched (the dialog's answers belong to *Publish, schedule & versions*).
 * Returns the new publication's id from the app's own POST …/version
 * response. U40's shape.
 */
async function createNewVersionFromWorkflow(page) {
    const item = await new WorkflowPage(page, null).revealPublicationEntry('Create New Version');
    await item.click();
    const dialog = page.getByRole('dialog', {name: 'Create New Version'});
    await expect(dialog).toBeVisible({timeout: 30_000});
    await expect(dialog.getByLabel('Publication Stage')).toBeVisible({timeout: 30_000});
    const created = page.waitForResponse(
        (r) =>
            /\/publications\/\d+\/version/.test(r.url()) &&
            r.request().method() === 'POST' &&
            r.ok(),
        {timeout: 30_000}
    );
    await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
    const body = await (await created).json();
    await expect(dialog).toHaveCount(0, {timeout: 30_000});
    return body.id;
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

const CI_SETTING =
    'Require submitting Authors to file a Competing Interest (CI) statement with their submission.';

/** Tick or untick the Metadata screen's competing-interests requirement and save. */
async function setCompetingInterestsSetting(page, contextPath, on) {
    await openMetadataSettings(page, contextPath);
    const form = metadataSettingsForm(page);
    const box = form.getByRole('checkbox', {name: CI_SETTING});
    if (on) {
        await box.check();
    } else {
        await box.uncheck();
    }
    await saveSettingsForm(page, form);
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

/** The book page's authors block and its per-contributor credits. */
function authorsBlock(page) {
    return page.locator('.item.authors');
}

test.describe('Contributors & affiliations (U41)', () => {
    test('S1: maintain the contributor list', {tag: '@smoke'}, async ({asUser, ompApi, pkpMail}, testInfo) => {
        test.setTimeout(360_000);
        const tag = makeTag('s1', testInfo);
        const spec = scratchPressSpec(tag, {other: true});
        const [, author, other] = spec.users;
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
        const alanEmail = `${tag}alan@mail.test`;
        const orgName = 'Probe Org';

        const page = await (await asUser(`${tag}mg`)).newPage();
        const screen = await openContributors(page, tag, submissionId);

        // "Contributors": the entry sits second, right after "Title &
        // Abstract"; the page is headed "Contributors" with "Order",
        // "Preview" and "Add Contributor" above the rows; the submitting
        // author is listed with an "Author" badge, the "Primary Contact"
        // badge, "Edit" and "Delete" (Rules 2, 3, 10).
        await expect(page.getByRole('dialog').first()).toContainText(
            /Title & Abstract\s+Contributors/
        );
        await expect(screen.orderButton()).toBeVisible();
        await expect(screen.previewButton()).toBeVisible();
        await expect(screen.addContributorButton()).toBeVisible();
        const adaRow = screen.row('Ada Author');
        await expect(adaRow).toBeVisible();
        await expect(screen.roleBadge('Ada Author', 'Author')).toBeVisible();
        await expect(screen.primaryContactBadge('Ada Author')).toBeVisible();
        await expect(adaRow.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
        await expect(adaRow.getByRole('button', {name: 'Delete', exact: true})).toBeVisible();
        const logBefore = await readLogCount(page, METADATA_UPDATED);

        // An empty save: the panel opens on "Person"; Save with nothing
        // filled: "This field is required." under Given Name, Email,
        // Country and Contributor Roles, "Please correct 4 errors." with
        // "Jump to next error", and Save disabled. It stays disabled after
        // one flagged field is edited and enables once every flagged field
        // has been (T-omp-1: the spec's "until one of them is edited" is
        // not what the form does; the foot's Save is disabled while any
        // error remains).
        let dialog = await screen.openAdd();
        await expect(screen.typeRadio(dialog, 'Person')).toBeChecked();
        await screen.saveButton(dialog).click();
        await expect(screen.errorSummary(dialog)).toHaveText(/Please correct 4 errors\./, {
            timeout: 30_000,
        });
        await expect(screen.requiredError(dialog, /^Given Name/)).toBeVisible();
        await expect(screen.requiredError(dialog, /^Email/)).toBeVisible();
        await expect(screen.requiredError(dialog, /^Country/)).toBeVisible();
        await expect(screen.requiredError(dialog, /^Contributor Roles/)).toBeVisible();
        await expect(screen.jumpToNextError(dialog)).toBeVisible();
        await expect(screen.saveButton(dialog)).toBeDisabled();
        await screen.fillPersonFields(dialog, {given: 'Alan'});
        await expect(screen.requiredError(dialog, /^Given Name/)).toHaveCount(0);
        await expect(screen.requiredError(dialog, /^Email/)).toBeVisible();
        await expect(screen.saveButton(dialog)).toBeDisabled();

        // A bad Email and Homepage URL: with the other flagged fields
        // edited Save enables; the save is refused and the panel stays
        // open, with an error under Email and under Homepage URL (the
        // refusal only; the body quotes no message text).
        await screen.fillPersonFields(dialog, {email: 'not-an-address', country: 'Canada'});
        await dialog.locator('input[name="url"]').fill('not a web address');
        await screen.setRole(dialog, 'Author', true);
        await expect(screen.errorSummary(dialog)).toHaveCount(0);
        await expect(screen.saveButton(dialog)).toBeEnabled();
        await screen.saveButton(dialog).click();
        await expect(screen.errorSummary(dialog)).toBeVisible({timeout: 30_000});
        await expect(screen.jumpLink(dialog, /Email( address)?/)).toBeVisible();
        await expect(screen.jumpLink(dialog, 'Homepage URL')).toBeVisible();
        await expect(dialog).toBeVisible();
        await expect(screen.rowsBehindWindow()).toHaveCount(1);

        // The person: a good Email, Homepage URL cleared, Save: the panel
        // closes and the new row shows "Alan" with an "Author" badge.
        await screen.fillPersonFields(dialog, {email: alanEmail});
        await dialog.locator('input[name="url"]').fill('');
        await screen.savePanel(dialog);
        await expect(screen.row('Alan')).toBeVisible();
        await expect(screen.roleBadge('Alan', 'Author')).toBeVisible();

        // The type switch: "Casey" typed, then "Organization or group":
        // the name fields swap to "Organization Name"; saved as "Probe
        // Org"; its "Edit" on "Person" shows an empty Given Name, the
        // other type's entry discarded on save; back to Organization,
        // Save (Fields; Rule 4).
        dialog = await screen.openAdd();
        await screen.fillPersonFields(dialog, {given: 'Casey'});
        await screen.typeRadio(dialog, 'Organization or group').check();
        await expect(screen.field(dialog, /^Organization Name/)).toBeVisible();
        await expect(screen.field(dialog, /^Given Name/)).toHaveCount(0);
        await dialog.locator('input[name^="organizationName"]').first().fill(orgName);
        await screen.fillPersonFields(dialog, {
            email: `${tag}org@mail.test`,
            country: 'Canada',
        });
        await screen.setRole(dialog, 'Author', true);
        await screen.savePanel(dialog);
        await expect(screen.row(orgName)).toBeVisible();
        await expect(screen.roleBadge(orgName, 'Author')).toBeVisible();
        dialog = await screen.openRowEdit(orgName);
        await screen.typeRadio(dialog, 'Person').check();
        await expect(dialog.locator('input[name^="givenName"]').first()).toHaveValue('');
        await screen.typeRadio(dialog, 'Organization or group').check();
        await expect(dialog.locator('input[name^="organizationName"]').first()).toHaveValue(
            orgName
        );
        await screen.savePanel(dialog);
        await expect(screen.row(orgName)).toBeVisible();

        // Edit: a Family Name on the person — the row updates in place.
        dialog = await screen.openRowEdit('Alan');
        await expect(dialog.locator('input[name^="givenName"]').first()).toHaveValue('Alan');
        await screen.fillPersonFields(dialog, {family: 'Mwandenga'});
        await screen.savePanel(dialog);
        await expect(screen.row('Alan Mwandenga')).toBeVisible();

        // An Anonymous contributor: no name fields, ROR ID, Homepage URL,
        // Bio Statement or Affiliations (each absence bounded by the Email
        // field on screen), only Email, Country, Contributor Roles, CRediT
        // roles and Publication Lists; the row is titled "Anonymous" and
        // Preview's "Full" row ends "; Anonymous (Author)" (Rules 3, 7).
        dialog = await screen.openAdd();
        await screen.typeRadio(dialog, 'Anonymous').check();
        await expect(screen.field(dialog, /^Email/)).toBeVisible();
        await expect(screen.field(dialog, /^Given Name/)).toHaveCount(0);
        await expect(screen.field(dialog, /^Family Name/)).toHaveCount(0);
        await expect(screen.field(dialog, /^Organization Name/)).toHaveCount(0);
        await expect(screen.field(dialog, /^ROR ID/)).toHaveCount(0);
        await expect(screen.field(dialog, /^Homepage URL/)).toHaveCount(0);
        await expect(screen.field(dialog, /^Bio Statement/)).toHaveCount(0);
        await expect(screen.field(dialog, /^Affiliations/)).toHaveCount(0);
        await expect(screen.field(dialog, /^Country/)).toBeVisible();
        await expect(screen.field(dialog, /^Contributor Roles/)).toBeVisible();
        await expect(screen.creditRolesTable(dialog)).toBeVisible();
        await expect(screen.publicationListsBox(dialog)).toBeVisible();
        await screen.fillPersonFields(dialog, {email: `${tag}anon@mail.test`, country: 'Canada'});
        await screen.setRole(dialog, 'Author', true);
        await screen.savePanel(dialog);
        await expect(screen.row('Anonymous')).toBeVisible();
        await expect(screen.roleBadge('Anonymous', 'Author')).toBeVisible();
        let preview = await screen.openPreview();
        await expect(screen.previewValue(preview, 'Full')).toHaveText(/; Anonymous \(Author\)$/);
        await screen.closePreview(preview);

        // Delete: the dialog's question; "Cancel" keeps the row; "Delete
        // Contributor" removes it; the "Anonymous" row the same way, its
        // dialog asking to remove "Anonymous" (Rules 3, 5).
        let confirm = await screen.openRowDelete(orgName);
        await expect(confirm).toContainText(
            `Are you sure you want to remove ${orgName} as a contributor? This action can not be undone.`
        );
        await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(confirm).toHaveCount(0, {timeout: 30_000});
        await expect(screen.row(orgName)).toBeVisible();
        confirm = await screen.openRowDelete(orgName);
        await screen.confirmDelete(confirm, orgName);
        confirm = await screen.openRowDelete('Anonymous');
        await expect(confirm).toContainText(
            'Are you sure you want to remove Anonymous as a contributor?'
        );
        await screen.confirmDelete(confirm, 'Anonymous');
        await expect(screen.rows()).toHaveCount(2);
        await expect(screen.row('Alan Mwandenga')).toBeVisible();

        // Nothing else happens: the Activity Log has no new line after
        // the adds, edits and deletes (the count read before them), and
        // no email reached the submitter or the added contributor,
        // bounded by the control discussion mail (A8).
        await expect(await activityLogRows(page, METADATA_UPDATED)).toHaveCount(logBefore);
        await closeActivityLog(page);
        await expectNoMailAfterControl(page, pkpMail, {
            tag,
            contextPath: tag,
            otherSubmissionId: otherSubmission.submissionId,
            other,
            targets: [author.email, alanEmail],
        });

        // Control: "Set Primary Contact" on this same submission writes
        // one "Submission metadata updated" line (scenario 3's line).
        const control = await openContributors(page, tag, submissionId);
        await control.setPrimaryContact('Alan Mwandenga');
        await expect(control.primaryContactBadge('Alan Mwandenga')).toBeVisible({
            timeout: 30_000,
        });
        await expect(await activityLogRows(page, METADATA_UPDATED)).toHaveCount(logBefore + 1);
        await closeActivityLog(page);
    });

    test('S2: reorder and preview the display formats', async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(360_000);
        const tag = makeTag('s2', testInfo);
        const family = `B${tag}`;
        const inst = `Probe Institute ${tag}`;
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        await stubRegistrySearch(page);
        let screen = await openContributors(page, PK, submissionId);
        await screen.addContributor({
            given: 'Bora',
            family,
            email: `${tag}bora@mail.test`,
        });
        // Pin the starting order (submitter first) — see pinOrder.
        await pinOrder(page, screen, 'Alex Author');

        // Control: before "Save Order", the list shows the submitting
        // author first and the added contributor second on a reload, and
        // "Abbreviated" names their family name (Rule 6).
        screen = await openContributors(page, PK, submissionId);
        await expect(screen.rows().first()).toContainText('Alex Author');
        await expect(screen.rows().nth(1)).toContainText(`Bora ${family}`);

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
        // The move is content-verified like the save above: an arrow press
        // issued while the list re-renders into ordering mode can be
        // swallowed (ci-triage flake watch, seen on the OPS twin; CI run
        // 34466942823, 2026-09-10; the OMP twin locally at four workers,
        // 2026-09-14), so each bounded attempt (re-)enters ordering, waits
        // for the row's own arrow and passes only when the list shows the
        // move. A repeat press on an already-first row is a no-op.
        const alexUp = page.getByRole('button', {
            name: 'Increase position of Alex Author',
        });
        await expect(async () => {
            if (!(await screen.saveOrderButton().isVisible())) {
                await screen.orderButton().click({timeout: 2_000});
            }
            await expect(alexUp).toBeVisible({timeout: 5_000});
            await alexUp.click({timeout: 2_000});
            await expect(screen.rows().first()).toContainText('Alex Author', {
                timeout: 2_000,
            });
        }).toPass({intervals: [1_000, 2_000], timeout: 60_000});
        await screen.cancelOrderingButton().click();
        await expect(screen.rows().first()).toContainText(`Bora ${family}`, {
            timeout: 30_000,
        });
        await expect(screen.orderButton()).toBeVisible();

        // A new version: a typed affiliation on the first contributor,
        // then "Create New Version" confirmed unchanged: the new version's
        // "Contributors" lists the same rows in the saved order, each with
        // its "Author" badge, the "Primary Contact" badge on the submitting
        // author's row, and the affiliation in the first contributor's
        // "Edit" (the row never shows it, A1) (Rule 1; Fields).
        let dialog = await screen.openRowEdit(`Bora ${family}`);
        await screen.addTypedInstitution(dialog, inst);
        await screen.savePanel(dialog);
        const newPublicationId = await createNewVersionFromWorkflow(page);
        screen = await openContributors(page, PK, submissionId, {
            publicationId: newPublicationId,
        });
        await expect(screen.rows()).toHaveCount(2);
        await expect(screen.rows().first()).toContainText(`Bora ${family}`);
        await expect(screen.rows().nth(1)).toContainText('Alex Author');
        await expect(screen.roleBadge(`Bora ${family}`, 'Author')).toBeVisible();
        await expect(screen.roleBadge('Alex Author', 'Author')).toBeVisible();
        await expect(screen.primaryContactBadge('Alex Author')).toBeVisible();
        await expect(screen.primaryContactBadge(`Bora ${family}`)).toHaveCount(0);
        dialog = await screen.openRowEdit(`Bora ${family}`);
        await expect(screen.affiliationRow(dialog, inst)).toBeVisible();
        await screen.closePanel(dialog);
    });

    test('S3: move the primary contact', async ({asUser, ompApi, pkpMail}, testInfo) => {
        test.setTimeout(360_000);
        const tag = makeTag('s3', testInfo);
        const family = `P${tag}`;
        const piaEmail = `${tag}pia@mail.test`;
        const spec = scratchPressSpec(tag, {other: true});
        const [, author, other] = spec.users;
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

        const page = await (await asUser(`${tag}mg`)).newPage();
        let screen = await openContributors(page, tag, submissionId);
        await screen.addContributor({
            given: 'Pia',
            family,
            email: piaEmail,
        });
        const logBefore = await readLogCount(page, METADATA_UPDATED);

        // The submitting author's row carries the badge; the other row
        // offers "Set Primary Contact" (Rule 10).
        await expect(screen.primaryContactBadge('Ada Author')).toBeVisible();
        await expect(screen.setPrimaryContactButton(`Pia ${family}`)).toBeVisible();

        // Pressing it moves the badge at once — no confirmation dialog,
        // just the publication save.
        await screen.setPrimaryContact(`Pia ${family}`);
        await expect(screen.primaryContactBadge(`Pia ${family}`)).toBeVisible({
            timeout: 30_000,
        });
        await expect(screen.setPrimaryContactButton('Ada Author')).toBeVisible();
        await expect(screen.primaryContactBadge('Ada Author')).toHaveCount(0);

        // The choice persists across a reload.
        screen = await openContributors(page, tag, submissionId);
        await expect(screen.primaryContactBadge(`Pia ${family}`)).toBeVisible();

        // The log and the mailbox: one new "Submission metadata updated"
        // line, and no email to the submitter or the new contact, bounded
        // by the control discussion mail (Side effects; A8).
        await expect(await activityLogRows(page, METADATA_UPDATED)).toHaveCount(logBefore + 1);
        await closeActivityLog(page);
        await expectNoMailAfterControl(page, pkpMail, {
            tag,
            contextPath: tag,
            otherSubmissionId: otherSubmission.submissionId,
            other,
            targets: [author.email, piaEmail],
        });

        // Deleting the primary contact: the remaining row still shows
        // only "Set Primary Contact" — no contact, nothing warned
        // (Rules 5, 10).
        screen = await openContributors(page, tag, submissionId);
        await screen.deleteContributor(`Pia ${family}`);
        await expect(screen.setPrimaryContactButton('Ada Author')).toBeVisible();
        await expect(screen.primaryContactBadge('Ada Author')).toHaveCount(0);

        // The publish dialog (the press's: the header's "Publish" opens
        // the "Schedule For Publication" window at once): "All
        // publication requirements have been met."; its only other button
        // is "Publish", no Cancel; back out with "Close" (the silence
        // about the missing contact is A2, not asserted).
        await page.getByRole('button', {name: 'Publish', exact: true}).click();
        const publishDialog = page.getByRole('dialog', {name: /Schedule For Publication/});
        await expect(publishDialog).toBeVisible({timeout: 30_000});
        await expect(
            publishDialog.getByText('All publication requirements have been met.')
        ).toBeVisible();
        await expect(publishDialog.getByRole('button', {name: 'Publish', exact: true})).toBeVisible();
        await expect(publishDialog.getByRole('button', {name: 'Cancel'})).toHaveCount(0);
        await publishDialog.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(publishDialog).toHaveCount(0, {timeout: 30_000});
        await expect(screen.row('Ada Author')).toBeVisible();

        // The last contributor: the emptied list shows "No items found."
        // beneath the unchanged buttons, and Preview's three formats show
        // nothing (Rule 5).
        await screen.deleteContributor('Ada Author');
        await expect(screen.emptyMessage()).toBeVisible();
        await expect(screen.rows()).toHaveCount(0);
        await expect(screen.orderButton()).toBeVisible();
        await expect(screen.previewButton()).toBeVisible();
        await expect(screen.addContributorButton()).toBeVisible();
        const preview = await screen.openPreview();
        for (const format of ['Abbreviated', 'Publication Lists', 'Full']) {
            await expect(screen.previewRow(preview, format)).toBeVisible();
            await expect(screen.previewValue(preview, format)).toHaveText('');
        }
        await screen.closePreview(preview);

        // Control: the deletes wrote nothing — the log still holds the
        // one line from the move.
        await expect(await activityLogRows(page, METADATA_UPDATED)).toHaveCount(logBefore + 1);
        await closeActivityLog(page);
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

        // Control: the second institution's French box stayed empty and
        // its save was not refused — only the submission language's copy
        // is ever required (Fields).
        await expect(screen.affiliationRow(dialog, instB)).toContainText(
            '1 of 2 languages completed'
        );

        // A save without the submission language's name is refused with
        // the inline message (Fields & validation; the garbled summary
        // line of A7 is never asserted).
        await screen.openAffiliationRowAction(dialog, instA, 'Edit institution name');
        await screen.affiliationNameBoxes(dialog, instA).first().fill('');
        await screen.saveButton(dialog).click();
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
        await expect(confirm).toContainText(`The affiliation ${instB} will be deleted.`);
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
        test.setTimeout(300_000);
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

        // "Edit Role" behind the new row's "…" menu: the Role Identifier
        // drop-down offers only the role's own identifier (Rule 12).
        await openRoleRowAction(page, roleName, 'Edit');
        const editRoleDialog = page.getByRole('dialog', {name: 'Edit Role'});
        await expect(editRoleDialog).toBeVisible({timeout: 30_000});
        await expect(editRoleDialog.locator('select')).toHaveValue('CHAIR');
        await expect(editRoleDialog.locator('select option')).toHaveCount(1);
        await expect(editRoleDialog.locator('select option')).toHaveText(['CHAIR']);
        await editRoleDialog.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(editRoleDialog).toHaveCount(0, {timeout: 30_000});

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
        await expect(errorDialog).toContainText('Change the role to another before delete.');
        await errorDialog.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(errorDialog).toHaveCount(0, {timeout: 30_000});
        await expect(roleRow(page, roleName)).toBeVisible();

        // Untick the role, then delete it: the confirm button enables
        // only on an exact identifier match, and "Role Deleted" confirms.
        // (Control: the refusals are the held role's and the last AUTHOR
        // role's alone — the freed role goes through the same dialog.)
        screen = await openContributors(page, tag, submissionId);
        dialog = await screen.openRowEdit('Ada Author');
        await screen.setRole(dialog, roleName, false);
        await screen.savePanel(dialog);
        await expect(screen.roleBadge('Ada Author', roleName)).toHaveCount(0);

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

        // The last AUTHOR role: while the contributor still holds
        // "Author", the in-use refusal shows (with both refusals
        // applicable, the in-use one is shown) (Rule 13).
        await openRoleRowAction(page, 'Author', 'Delete Role');
        confirmDialog = typeToConfirmDialog(page);
        await confirmDialog.getByRole('textbox').fill('AUTHOR');
        await confirmDeleteButton(confirmDialog).click();
        errorDialog = page
            .getByRole('dialog')
            .filter({hasText: 'One or more contributors are using this role'});
        await expect(errorDialog).toBeVisible({timeout: 30_000});
        await errorDialog.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(errorDialog).toHaveCount(0, {timeout: 30_000});
        await expect(roleRow(page, 'Author')).toBeVisible();

        // Press-flavored last-AUTHOR leg: with the contributor moved to
        // Translator and "Chapter Author" (the other AUTHOR role, its
        // dialog also asking for "AUTHOR") deleted, "Author" is the last
        // AUTHOR-identifier role and cannot be deleted.
        screen = await openContributors(page, tag, submissionId);
        dialog = await screen.openRowEdit('Ada Author');
        await screen.setRole(dialog, 'Translator', true);
        await screen.setRole(dialog, 'Author', false);
        await screen.savePanel(dialog);
        await expect(screen.roleBadge('Ada Author', 'Translator')).toBeVisible();
        await expect(screen.roleBadge('Ada Author', 'Author')).toHaveCount(0);

        await openContributorRolesSettings(page, tag);
        await openRoleRowAction(page, 'Chapter Author', 'Delete Role');
        confirmDialog = typeToConfirmDialog(page);
        await expect(
            confirmDialog.getByText(
                'Are you absolutely sure you want to delete "AUTHOR" role?'
            )
        ).toBeVisible({timeout: 30_000});
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
        await expect(roleRow(page, 'Author')).toBeVisible();

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
        test.setTimeout(360_000);
        const tag = makeTag('s6', testInfo);
        const family = `Bee${tag}`;
        const inst = `Institute ${tag}`;
        const bio = `Ada studies contributor lists ${tag}.`;
        await ompApi.createContext(scratchPressSpec(tag));
        const [{submissionId}, five] = await Promise.all([
            ompApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: `${tag}au`,
                title: `Submission ${tag}`,
                decisions: ['skipExternalReview', 'sendToProduction'],
                published: true,
            }),
            ompApi.createSubmission({
                tag: `${tag}f`,
                context: tag,
                submitter: `${tag}au`,
                title: `Fivefold ${tag}`,
                decisions: ['skipExternalReview', 'sendToProduction'],
                published: true,
            }),
        ]);

        // First-listed contributor: typed affiliation, Bio Statement, two
        // roles and the CRediT role "Conceptualization" at "Lead"; second
        // contributor: plain (published pages stay editable for the
        // manager — Actors & permissions).
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await stubRegistrySearch(managerPage);
        let screen = await openContributors(managerPage, tag, submissionId);
        let dialog = await screen.openRowEdit('Ada Author');
        await screen.fillPersonFields(dialog, {country: 'Canada'});
        await screen.setRole(dialog, 'Translator', true);
        await screen.addTypedInstitution(dialog, inst);
        const bioBody = screen.richBody(dialog, /^Bio Statement/);
        await bioBody.click();
        await bioBody.fill(bio);
        await screen.addCreditRole(dialog, 'Conceptualization', 'Lead');
        await screen.savePanel(dialog);
        await screen.addContributor({
            given: 'Bob',
            family,
            email: `${tag}bob@mail.test`,
        });
        // Pin the list order (Ada first) — see pinOrder.
        await pinOrder(managerPage, screen, 'Ada Author');

        // Control: in the workflow, the "Primary Contact" badge sits on
        // the submitting author's row — the choice readers never see
        // (Rules 3, 10).
        await expect(screen.primaryContactBadge('Ada Author')).toBeVisible();
        await expect(screen.primaryContactBadge(`Bob ${family}`)).toHaveCount(0);

        // The second book: four more contributors (five with the
        // submitter), none with an affiliation — so the compacted line's
        // dangling-comma symptom (A1) never renders.
        screen = await openContributors(managerPage, tag, five.submissionId);
        const givens = ['Cara', 'Dana', 'Erik', 'Fola'];
        for (const [i, given] of givens.entries()) {
            await screen.addContributor({
                given,
                family: `F${i}${tag}`,
                email: `${tag}c${i}@mail.test`,
            });
        }

        // The book page credits both in list order: names, the typed
        // affiliation's name, the contributor role names, and the first
        // contributor's CRediT role with its degree (Rule 14; Fields).
        await page.goto(bookUrl(tag, submissionId));
        const credits = authorsBlock(page).locator('.sub_item');
        await expect(credits).toHaveCount(2, {timeout: 30_000});
        await expect(credits.first()).toContainText('Ada Author');
        await expect(credits.first().locator('.value.affiliation')).toContainText(inst);
        await expect(credits.first().locator('.contributor_roles')).toContainText(
            'Author'
        );
        await expect(credits.first().locator('.contributor_roles')).toContainText(
            'Translator'
        );
        await expect(credits.first().locator('.credit_roles')).toContainText(
            'Conceptualization (Lead)'
        );
        await expect(credits.nth(1)).toContainText(`Bob ${family}`);
        await expect(credits.nth(1).locator('.value.affiliation')).toHaveCount(0);
        await expect(credits.nth(1).locator('.contributor_roles')).toContainText(
            'Author'
        );
        await expect(credits.nth(1)).not.toContainText('Conceptualization');
        await expect(credits.nth(1)).not.toContainText('(Lead)');

        // No contact mark on the landing page (bounded by the credits
        // above) (Rule 10).
        await expect(authorsBlock(page)).not.toContainText('Primary Contact');

        // One contributor with a Bio Statement → the singular "Author
        // Biography" section, "{name}, {affiliation}" above the statement.
        const bios = page.locator('.item.author_bios');
        await expect(bios.getByRole('heading', {name: 'Author Biography'})).toBeVisible();
        await expect(bios).toContainText('Ada Author,');
        await expect(bios).toContainText(inst);
        await expect(bios).toContainText(bio);

        // The catalog listing shows the author line in the "Full" format —
        // names with roles in parentheses, and no contact mark (Rules 10,
        // 15).
        await page.goto(catalogUrl(tag));
        const authorLine = catalogAuthorLine(page, `Submission ${tag}`);
        await expect(authorLine).toContainText('Ada Author (', {timeout: 30_000});
        await expect(authorLine).toContainText('Translator');
        await expect(authorLine).toContainText(`Bob ${family} (Author)`);
        await expect(authorLine).not.toContainText('Primary Contact');

        // A book with five contributors: the credits compact to a single
        // flowed line of semicolon-joined names — no per-contributor
        // blocks, no role names (OMP1). Name order is not asserted: this
        // list is never pinned and the rule is presence, not order.
        await page.goto(bookUrl(tag, five.submissionId));
        const fiveBlock = authorsBlock(page);
        await expect(fiveBlock).toContainText('Ada Author', {timeout: 30_000});
        for (const [i, given] of givens.entries()) {
            await expect(fiveBlock).toContainText(`${given} F${i}${tag}`);
        }
        await expect(fiveBlock).toContainText(';');
        await expect(fiveBlock.locator('.sub_item')).toHaveCount(0);
        await expect(fiveBlock.locator('.contributor_roles')).toHaveCount(0);
        await expect(fiveBlock.locator('.value.affiliation')).toHaveCount(0);
    });

    test('S7: the publication-lists tick governs the press catalog listing', async ({asUser, ompApi, page}, testInfo) => {
        test.setTimeout(300_000);
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
        // Pin the list order (Ada first) — see pinOrder.
        await pinOrder(managerPage, screen, 'Ada Author');

        // Control: before any untick, "Publication Lists" and "Full" read
        // the same names and roles (Rule 7).
        let preview = await screen.openPreview();
        await expect(screen.previewRow(preview, 'Publication Lists')).toContainText(
            `Ada Author (Author); Cara ${family} (Author)`
        );
        await expect(screen.previewRow(preview, 'Full')).toContainText(
            `Ada Author (Author); Cara ${family} (Author)`
        );
        await screen.closePreview(preview);

        // Untick "Publication Lists" on the second contributor (Rule 8).
        let dialog = await screen.openRowEdit(`Cara ${family}`);
        await screen.publicationListsBox(dialog).uncheck();
        await screen.savePanel(dialog);

        // Preview: the "Publication Lists" format omits them while "Full"
        // keeps them (each absence bounded by the same row naming Ada).
        preview = await screen.openPreview();
        let listsRow = screen.previewRow(preview, 'Publication Lists');
        await expect(listsRow).toContainText('Ada Author');
        await expect(listsRow).not.toContainText(`Cara ${family}`);
        await expect(screen.previewRow(preview, 'Full')).toContainText(
            `Cara ${family}`
        );
        await screen.closePreview(preview);

        // The landing page still credits both…
        await page.goto(bookUrl(tag, submissionId));
        await expect(authorsBlock(page)).toContainText('Ada Author');
        await expect(authorsBlock(page)).toContainText(`Cara ${family}`);

        // …while the press's catalog listing — the one reader listing that
        // honors the tick — drops the unticked contributor (the absence
        // bounded by the same line naming Ada).
        await page.goto(catalogUrl(tag));
        const authorLine = catalogAuthorLine(page, `Submission ${tag}`);
        await expect(authorLine).toContainText('Ada Author', {timeout: 30_000});
        await expect(authorLine).not.toContainText(`Cara ${family}`);

        // "Abbreviated" ignores the tick: re-tick the second contributor,
        // untick the first (the seeded contributor's missing Country
        // filled once, A16): "Publication Lists" omits the first while
        // "Abbreviated" still reads the first's family name plus "et al."
        // (Rule 8).
        dialog = await screen.openRowEdit(`Cara ${family}`);
        await screen.publicationListsBox(dialog).check();
        await screen.savePanel(dialog);
        dialog = await screen.openRowEdit('Ada Author');
        await screen.fillPersonFields(dialog, {country: 'Canada'});
        await screen.publicationListsBox(dialog).uncheck();
        await screen.savePanel(dialog);
        preview = await screen.openPreview();
        listsRow = screen.previewRow(preview, 'Publication Lists');
        await expect(listsRow).toContainText(`Cara ${family} (Author)`);
        await expect(listsRow).not.toContainText('Ada Author');
        await expect(screen.previewRow(preview, 'Abbreviated')).toContainText(
            'Author et al.'
        );
        await expect(screen.previewRow(preview, 'Full')).toContainText(
            `Ada Author (Author); Cara ${family} (Author)`
        );
        await screen.closePreview(preview);
    });

    test('S8: require competing interests', async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s8', testInfo);
        const statement = `No competing interests ${tag}.`;
        await ompApi.createContext(scratchPressSpec(tag));
        const {submissionId} = await ompApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
        });
        const page = await (await asUser(`${tag}mg`)).newPage();

        // Control: before the tick, the contributor's form has no
        // "Competing Interests" field (bounded by its Email field).
        let screen = await openContributors(page, tag, submissionId);
        let dialog = await screen.openRowEdit('Ada Author');
        await expect(dialog.locator('input[name="email"]')).toBeVisible();
        await expect(screen.field(dialog, /^Competing Interests/)).toHaveCount(0);
        await screen.closePanel(dialog);

        // The setting: tick the requirement on the workflow settings'
        // Metadata screen — editing the contributor now shows a required
        // "Competing Interests" field (Settings; Fields).
        await setCompetingInterestsSetting(page, tag, true);
        screen = await openContributors(page, tag, submissionId);
        dialog = await screen.openRowEdit('Ada Author');
        await expect(screen.field(dialog, /^Competing Interests/)).toBeVisible();
        await expect(
            dialog.getByText(
                'Please disclose any competing interests this author may have with the research subject.'
            )
        ).toBeVisible();

        // An empty statement: the save is refused on the form — "This
        // field is required." under the field and "Please correct one
        // error." at the foot (the seeded contributor's missing Country
        // filled first, A16, so the refusal is the statement's alone).
        await screen.fillPersonFields(dialog, {country: 'Canada'});
        await screen.saveButton(dialog).click();
        await expect(screen.errorSummary(dialog)).toHaveText(/Please correct one error\./, {
            timeout: 30_000,
        });
        await expect(screen.requiredError(dialog, /^Competing Interests/)).toBeVisible();
        await expect(screen.jumpToNextError(dialog)).toBeVisible();

        // A statement saves: the panel closes.
        const ciBody = screen.richBody(dialog, /^Competing Interests/);
        await ciBody.click();
        await ciBody.fill(statement);
        await screen.savePanel(dialog);

        // The setting off: the field is gone from the form (bounded by
        // the form's Email field rendering).
        await setCompetingInterestsSetting(page, tag, false);
        screen = await openContributors(page, tag, submissionId);
        dialog = await screen.openRowEdit('Ada Author');
        await expect(dialog.locator('input[name="email"]')).toBeVisible();
        await expect(screen.field(dialog, /^Competing Interests/)).toHaveCount(0);
        await screen.closePanel(dialog);

        // The setting on again: the field is back with the statement
        // intact.
        await setCompetingInterestsSetting(page, tag, true);
        screen = await openContributors(page, tag, submissionId);
        dialog = await screen.openRowEdit('Ada Author');
        await expect(screen.field(dialog, /^Competing Interests/)).toBeVisible();
        await expect(screen.richBody(dialog, /^Competing Interests/)).toContainText(statement);
        await screen.closePanel(dialog);
    });

    test("S9: the author's workflow contributors list is read-only", async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s9', testInfo);
        const family = `N${tag}`;
        const [{submissionId}, draft] = await Promise.all([
            ompApi.createSubmission({
                tag,
                context: PK,
                submitter: 'author.alex',
                title: `Submission ${tag}`,
            }),
            ompApi.createSubmission({
                tag: `${tag}d`,
                context: PK,
                submitter: 'author.alex',
                title: `Draft ${tag}`,
                submitted: false,
            }),
        ]);

        // Control (the editable side, taken the same way): the Press
        // Manager's view offers Order, Preview and Add Contributor, and
        // each row's "Primary Contact" or "Set Primary Contact", "Edit"
        // and "Delete" (Rules 2, 3); the second contributor is added here.
        const managerPage = await (await asUser('manager.maya')).newPage();
        const managerScreen = await openContributors(managerPage, PK, submissionId);
        await managerScreen.addContributor({
            given: 'Nia',
            family,
            email: `${tag}nia@mail.test`,
        });
        await expect(managerScreen.orderButton()).toBeVisible();
        await expect(managerScreen.previewButton()).toBeVisible();
        await expect(managerScreen.addContributorButton()).toBeVisible();
        const managerAlex = managerScreen.row('Alex Author');
        await expect(managerScreen.primaryContactBadge('Alex Author')).toBeVisible();
        await expect(managerAlex.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
        await expect(managerAlex.getByRole('button', {name: 'Delete', exact: true})).toBeVisible();
        const managerNia = managerScreen.row(`Nia ${family}`);
        await expect(managerScreen.setPrimaryContactButton(`Nia ${family}`)).toBeVisible();
        await expect(managerNia.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
        await expect(managerNia.getByRole('button', {name: 'Delete', exact: true})).toBeVisible();

        // The Author's list (Rule 9; Actors row 2): the rows with their
        // role badges and the "Preview" button; "Order", "Add
        // Contributor", "Set Primary Contact", "Edit" and "Delete" absent,
        // and no row carries the "Primary Contact" badge (the scenario's
        // own sentence; A6 is the open question).
        const authorPage = await (await asUser('author.alex')).newPage();
        const authorScreen = await openContributors(authorPage, PK, submissionId, {
            author: true,
        });
        await expect(authorScreen.rows()).toHaveCount(2);
        for (const name of ['Alex Author', `Nia ${family}`]) {
            const row = authorScreen.row(name);
            await expect(row).toBeVisible();
            await expect(authorScreen.roleBadge(name, 'Author')).toBeVisible();
            await expect(row.getByRole('button', {name: 'Edit', exact: true})).toHaveCount(0);
            await expect(row.getByRole('button', {name: 'Delete', exact: true})).toHaveCount(0);
            await expect(authorScreen.setPrimaryContactButton(name)).toHaveCount(0);
            await expect(authorScreen.primaryContactBadge(name)).toHaveCount(0);
        }
        await expect(authorScreen.previewButton()).toBeVisible();
        await expect(authorScreen.orderButton()).toHaveCount(0);
        await expect(authorScreen.addContributorButton()).toHaveCount(0);

        // Preview: "List of Contributors" with its "Abbreviated",
        // "Publication Lists" and "Full" rows (Rule 7).
        const preview = await authorScreen.openPreview();
        await expect(authorScreen.previewRow(preview, 'Abbreviated')).toContainText(
            'Author et al.'
        );
        await expect(authorScreen.previewRow(preview, 'Publication Lists')).toContainText(
            'Alex Author (Author)'
        );
        await expect(authorScreen.previewRow(preview, 'Full')).toContainText(
            `Nia ${family} (Author)`
        );
        await authorScreen.closePreview(preview);

        // The wizard's Contributors step on the Author's own draft: the
        // same list with "Order", "Preview" and "Add Contributor" above
        // the rows and "Edit" and "Delete" on the row — editable as
        // always there (Actors row 3; Cross-feature interactions).
        await authorPage.goto(`/index.php/${PK}/submission?id=${draft.submissionId}`);
        await expectWizardOpen(authorPage);
        await continueTo(authorPage, 'Details');
        await continueTo(authorPage, 'Contributors');
        const wizardScreen = new ContributorsScreen(authorPage);
        const wizardAlex = wizardScreen.row('Alex Author');
        await expect(wizardAlex).toBeVisible({timeout: 30_000});
        await expect(wizardScreen.orderButton()).toBeVisible();
        await expect(wizardScreen.previewButton()).toBeVisible();
        await expect(wizardScreen.addContributorButton()).toBeVisible();
        await expect(wizardAlex.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
        await expect(wizardAlex.getByRole('button', {name: 'Delete', exact: true})).toBeVisible();
    });

    test('S10: an Edited Volume credits its volume editors', async ({asUser, ompApi, page}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s10', testInfo);
        const family = `Ved${tag}`;
        const monoFamily = `Mono${tag}`;
        await ompApi.createContext(scratchPressSpec(tag));
        const [{submissionId}, monograph] = await Promise.all([
            ompApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: `${tag}au`,
                title: `Volume ${tag}`,
                workType: 'editedVolume',
                decisions: ['skipExternalReview', 'sendToProduction'],
                published: true,
            }),
            ompApi.createSubmission({
                tag: `${tag}m`,
                context: tag,
                submitter: `${tag}au`,
                title: `Monograph ${tag}`,
                decisions: ['skipExternalReview', 'sendToProduction'],
                published: true,
            }),
        ]);

        // A contributor holding the press's "Volume editor" role alone,
        // alongside the plain submitting author; the control monograph
        // (scenario 6's shape) gets a plain second contributor.
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        let screen = await openContributors(managerPage, tag, submissionId);
        await screen.addContributor({
            given: 'Vera',
            family,
            email: `${tag}vera@mail.test`,
            roles: ['Volume editor'],
        });
        await expect(screen.roleBadge(`Vera ${family}`, 'Volume editor')).toBeVisible();
        await expect(screen.roleBadge(`Vera ${family}`, 'Author')).toHaveCount(0);
        screen = await openContributors(managerPage, tag, monograph.submissionId);
        await screen.addContributor({
            given: 'Mia',
            family: monoFamily,
            email: `${tag}mia@mail.test`,
        });
        await pinOrder(managerPage, screen, 'Ada Author');

        // The book page credits the volume editor — name suffixed "(ed)",
        // with the role name "Volume editor" — in place of the contributor
        // list (the absent author bounded by the editor's credit in the
        // same block) (Rule 14; OMP2).
        await page.goto(bookUrl(tag, submissionId));
        const volumeBlock = authorsBlock(page);
        await expect(volumeBlock).toContainText(`Vera ${family} (ed)`, {
            timeout: 30_000,
        });
        await expect(volumeBlock.locator('.contributor_roles')).toContainText(
            'Volume editor'
        );
        await expect(volumeBlock).not.toContainText('Ada Author');

        // The catalog list's line keeps the full contributor list: both
        // names, each with its roles in parentheses (Rule 15; OMP2).
        await page.goto(catalogUrl(tag));
        const authorLine = catalogAuthorLine(page, `Volume ${tag}`);
        await expect(authorLine).toContainText('Ada Author (Author)', {
            timeout: 30_000,
        });
        await expect(authorLine).toContainText(`Vera ${family} (Volume editor)`);

        // Control: the two-contributor monograph's book page credits every
        // contributor in list order (Rule 14).
        await page.goto(bookUrl(tag, monograph.submissionId));
        const credits = authorsBlock(page).locator('.sub_item');
        await expect(credits).toHaveCount(2, {timeout: 30_000});
        await expect(credits.first()).toContainText('Ada Author');
        await expect(credits.nth(1)).toContainText(`Mia ${monoFamily}`);
        await expect(authorsBlock(page)).not.toContainText('(ed)');
    });

    test("S11: the reviewer's browser never receives the contributor list", async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(300_000);
        const anonTag = makeTag('s11a', testInfo);
        const openTag = makeTag('s11b', testInfo);

        // Two scratch presses: one at the install defaults ("Anonymous
        // Reviewer/Anonymous Author"), one whose default review type is
        // "Open"; each with a submission in external review and the
        // reviewer's accepted request (footnote s11).
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

        /**
         * Open the request from the reviewer dashboard, press step 1's
         * "View All Submission Details" and return the publication that
         * window fetched — the page's own traffic (the request the
         * reviewer's submission page makes for its contributors), never a
         * request the screens would not send. The window's content is
         * not read: the reviewer's screens belong to the review features.
         */
        async function publicationFetchedByReviewer(tag, submissionId) {
            const page = await (await asUser(`${tag}rv`)).newPage();
            const list = new ReviewerAssignmentsPage(page, tag);
            await list.goto('actionRequired');
            const row = list.row(`Review ${tag}`);
            await expect(row).toBeVisible({timeout: 30_000});
            await list.openWizard(row, 'Finish review');
            await expect(
                page.getByRole('heading', {name: `Review: Review ${tag}`, level: 1})
            ).toBeVisible({timeout: 30_000});
            const fetched = page.waitForResponse(
                (r) =>
                    r.url().includes(`/api/v1/submissions/${submissionId}/publications/`) &&
                    r.request().method() === 'GET' &&
                    r.ok(),
                {timeout: 30_000}
            );
            await page.getByRole('link', {name: 'View All Submission Details'}).click();
            return (await fetched).json();
        }

        // The anonymous assignment: the contributor list is withheld — the
        // data carries no contributor and empty author strings (Rule 17).
        const withheld = await publicationFetchedByReviewer(anonTag, anon.submissionId);
        expect(withheld.authors).toEqual([]);
        expect(withheld.authorsString).toBe('');
        expect(withheld.authorsStringShort).toBe('');

        // Control: on the open assignment the same data carries the full
        // contributor list (Rule 17).
        const full = await publicationFetchedByReviewer(openTag, open.submissionId);
        expect(full.authors.map((a) => a.fullName)).toEqual(['Ada Author']);
        expect(full.authorsString).toContain('Ada Author');
    });
});
