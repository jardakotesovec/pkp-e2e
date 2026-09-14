// @ts-check
/**
 * @file playwright/tests/U28-reviewers-review.spec.js
 *
 * U28 — Reviewer's review (docs/specs/U28-reviewers-review.md): the OPS
 * ABSENCE test, spec scenario 17. OPS installs no reviewer role and no
 * review stage (spec footnote p, install facts): no installed role gets a
 * "My Assignments as Reviewer" sidebar group, the reviewer's list address
 * shows the access-denied page, and the review wizard has no page on a
 * preprint server (a bare "404 Not Found"). Per RUNBOOK multi-app rule 3
 * the whole feature costs this ONE absence test, with a positive control
 * per assertion (PRINCIPLES M4): the same role's own dashboard, reached the
 * same way (a typed address), renders with its sidebar and list.
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as contract, a ❓ is parked, not a gap; the spec's
 * Coverage section is the record of the rest):
 * - OPS1 🐞 (scenario 17's "A home-made reviewer role" bullet: the
 *   Reviewer-level role is created and saved below, but no user is given
 *   it and its list page is never opened).
 * - A1 🐞, A2 🐞, A4 🐞, A5 🐞, A6 🐞, A7 🐞, A9 🐞, A10 🐞, A12 🐞,
 *   OMP2 🐞, OMP3 🐞, A3 ❓, A11 ❓, A13 ❓, OMP1 ✅, A8 ✅, OMP4 ✅
 *   (journal and press reviewer surfaces that do not exist on a preprint
 *   server; nothing to assert or park here).
 *
 * Seeding: a scratch preprint server (throwaway Preprint Server Manager,
 * Moderator and Author) + one submitted preprint via the scenario endpoints
 * (the seeded `publicknowledge` server holds no submissions, and is not
 * touched; nor is the seeded roster).
 */
const {test, expect} = require('../support/fixtures.js');
const {UsersRolesPage} = require('../pages/UserInvitationPages.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

/** Single hyphenless alphanumeric token — tag conventions in patterns.md. */
function makeTag(prefix) {
    return prefix + Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 7);
}

/** The reader-side access-denied page (the app redirects there). */
const DENIED_PATH = /user\/authorizationDenied/;
const DENIED_TEXT = 'The current role does not have access to this operation.';

/**
 * The two typed reviewer addresses for one signed-in account, bounded by a
 * positive control taken the same way (a typed address of the account's
 * own dashboard, asserted by the caller to have rendered with landmarks).
 */
async function expectNoReviewerPages(page, serverPath, submissionId) {
    // The reviewer's list address: the access-denied page (HTTP 200 after a
    // redirect, the reader-side layout, the one sentence).
    await page.goto(`/index.php/${serverPath}/dashboard/reviewAssignments`);
    await page.waitForURL(DENIED_PATH, {waitUntil: 'commit'});
    await expect(page.getByText(DENIED_TEXT)).toBeVisible();

    // The wizard's address for a real preprint: a bare "404 Not Found" page
    // with no server header (or navigation) around it — no redirect.
    const response = await page.goto(`/index.php/${serverPath}/reviewer/submission/${submissionId}`);
    expect(response && response.status()).toBe(404);
    expect(page.url()).toContain(`/reviewer/submission/${submissionId}`);
    await expect(page.getByRole('heading', {level: 1, name: '404 Not Found'})).toBeVisible();
    await expect(page.locator('header, [role="banner"]')).toHaveCount(0);
    await expect(page.locator('nav, [role="navigation"]')).toHaveCount(0);
}

test.describe("reviewer's review (U28) — OPS absence", () => {
    test('S17 {OPS}: no reviewer surfaces on a preprint server', async ({asUser, pkpApi}) => {
        const tag = makeTag('u28s17');
        const manager = `m${tag}`;
        const moderator = `mod${tag}`;
        const author = `a${tag}`;

        // Scratch preprint server with the three accounts the scenario names
        // (the Moderator is OPS's section-editor level); one seeded
        // (submitted, unposted) preprint, so the wizard address names a real
        // preprint (Rule 6).
        await pkpApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: moderator, roles: ['sectionEditor']},
                {username: author, roles: ['author']},
            ],
        });
        const title = `U28 s17 ${tag}`;
        const seeded = await pkpApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            title,
        });

        // ── Preprint Server Manager ─────────────────────────────────────────
        const managerPage = await (await asUser(manager)).newPage();
        // Positive control, taken the same way as the typed reviewer
        // addresses below: the typed Editor Dashboard address (its "Active
        // submissions" view) answers 200, with the backend header and
        // sidebar landmarks, the "Editor Dashboard" group and the
        // submissions list showing the seeded preprint.
        const editorial = await managerPage.goto(
            `/index.php/${tag}/dashboard/editorial?currentViewId=active`
        );
        expect(editorial && editorial.status()).toBe(200);
        const managerSidebar = managerPage.getByRole('navigation', {name: 'Site Navigation'});
        await expect(managerSidebar.getByText('Editor Dashboard')).toBeVisible();
        await expect(managerPage.locator('header, [role="banner"]').first()).toBeVisible();
        await expect(
            managerPage.getByRole('table').getByRole('row').filter({hasText: title})
        ).toBeVisible();
        // …and the sidebar has no "My Assignments as Reviewer" group
        // (bounded by the same sidebar having just rendered its Editor
        // Dashboard group).
        await expect(managerSidebar.getByText('My Assignments as Reviewer')).toHaveCount(0);

        await expectNoReviewerPages(managerPage, tag, seeded.submissionId);

        // ── Moderator (sees the same) ───────────────────────────────────────
        const moderatorPage = await (await asUser(moderator)).newPage();
        const moderatorEditorial = await moderatorPage.goto(`/index.php/${tag}/dashboard/editorial`);
        expect(moderatorEditorial && moderatorEditorial.status()).toBe(200);
        const moderatorSidebar = moderatorPage.getByRole('navigation', {name: 'Site Navigation'});
        await expect(moderatorSidebar.getByText('Editor Dashboard')).toBeVisible();
        await expect(moderatorSidebar.getByText('My Assignments as Reviewer')).toHaveCount(0);

        await expectNoReviewerPages(moderatorPage, tag, seeded.submissionId);

        // ── Author (sees the same) ──────────────────────────────────────────
        // An author has no Editor Dashboard; their own dashboard is the
        // positive control: the typed My Submissions address renders the
        // sidebar with the "My Submissions as Author" group.
        const authorPage = await (await asUser(author)).newPage();
        const mySubmissions = await authorPage.goto(`/index.php/${tag}/dashboard/mySubmissions`);
        expect(mySubmissions && mySubmissions.status()).toBe(200);
        const authorSidebar = authorPage.getByRole('navigation', {name: 'Site Navigation'});
        await expect(authorSidebar.getByText('My Submissions as Author')).toBeVisible();
        await expect(authorSidebar.getByText('My Assignments as Reviewer')).toHaveCount(0);

        await expectNoReviewerPages(authorPage, tag, seeded.submissionId);

        // ── Settings › Users & Roles › Roles ────────────────────────────────
        // The server's installed roles list no reviewer group. Positive
        // control, taken the same way: the installed groups' rows render.
        const users = new UsersRolesPage(managerPage, tag);
        await users.goto();
        await managerPage.getByRole('tab', {name: 'Roles', exact: true}).click();
        const roleRows = managerPage.locator('#roleGridContainer tr.gridRow');
        await expect(roleRows.filter({hasText: 'Preprint Server manager'})).toBeVisible();
        await expect(roleRows.filter({hasText: 'Moderator'})).toBeVisible();
        // …and no row names any reviewer role (bounded by the same grid's
        // rendered rows; scoped to rows, because the grid's filter select
        // carries the application-wide permission-level enum, which still
        // lists "Reviewer" — the very level the window below offers).
        await expect(roleRows.filter({hasText: /Review/i})).toHaveCount(0);

        // …its "Create New Role" window still offers the "Reviewer"
        // permission level (a legacy modal; form `#userGroupForm`, a
        // "Cancel" link and an "OK" button).
        await managerPage.locator('#roleGridContainer')
            .getByRole('link', {name: 'Create New Role', exact: true})
            .or(managerPage.locator('#roleGridContainer').getByRole('button', {name: 'Create New Role', exact: true}))
            .first().click();
        const roleForm = managerPage.locator('#userGroupForm');
        const level = roleForm.getByRole('combobox', {name: /^Permission level/});
        await expect(level).toBeVisible();
        await expect(level.locator('option', {hasText: /^Reviewer$/})).toHaveCount(1);
        // Positive control, read the same way: at a stage-taking level
        // ("Moderator"; the window opens on "Manager", which, like
        // "Reviewer" and "Reader", takes no stage) the only stage,
        // "Production", is offered enabled…
        const production = roleForm.getByRole('checkbox', {name: 'Production', exact: true});
        await level.selectOption({label: 'Moderator'});
        await expect(production).toBeEnabled();
        // …and choosing "Reviewer" greys it out (bounded by the same
        // window having just rendered). The spec's "the only stage" is not
        // asserted: between 2026-09-08 and 2026-09-12 (pkp/pkp-lib#13109,
        // then #13312) the "Stage Assignment" list and the Roles grid
        // carried a second stage, "Done", enabled under "Reviewer"
        // (T-ops-1, folded into the spec's scenario 17 footnote); the
        // stage count stays unasserted either way.
        await level.selectOption({label: 'Reviewer'});
        await expect(production).toBeDisabled();
        // …while the role still saves: "OK" closes the window and the grid
        // lists the new role at the "Reviewer" level (the sixth row).
        const roleName = `Scratch Reviewer ${tag}`;
        await roleForm.locator('[name="name[en]"]').fill(roleName);
        await roleForm.locator('[name="abbrev[en]"]').fill('SR');
        await roleForm.getByRole('button', {name: 'OK', exact: true}).click();
        await waitForJQueryIdle(managerPage);
        await expect(roleForm).toBeHidden();
        const savedRow = roleRows.filter({hasText: roleName});
        await expect(savedRow).toBeVisible();
        await expect(savedRow).toContainText('Reviewer');
        await expect(roleRows.filter({hasText: 'Moderator'})).toBeVisible();
    });
});
