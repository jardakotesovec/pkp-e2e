// @ts-check
/**
 * @file playwright/tests/U49-publish-schedule-and-versions.spec.js
 *
 * Publish, schedule & versions — OPS suite, one test per canonical COMMON
 * scenario as a preprint server runs it (scenarios 1–10, in OPS vocabulary:
 * the publish button is "Post", the confirmation window "Post the preprint",
 * the states "Unposted"/"Scheduled"/"Posted", the way back "Unpost", the
 * flow direct — no "Review Publishing Details" panel and no issues; the
 * date route on the Preprint entry page is what schedules) plus the
 * OPS-specific scenarios 15 (Post the preprint; the future-date leg) and 16
 * (the author cannot post). Scenarios 11–13 are journal-only and 14 is
 * press-only — no OPS surface.
 * Spec: docs/specs/U49-publish-schedule-and-versions.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - OPS1 🐞 (a scheduled preprint is never posted by anything): the
 *   SCHEDULED state itself is asserted (S9, S15); the never-posts half and
 *   the window's unchanged "…post this?" promise are not asserted either
 *   way.
 * - OPS2 ❓ (the posted acknowledgement is sent for a merely-scheduled
 *   post): the future-date legs assert no mail either way.
 * - OPS4 🐞 (every post sends "New Version Posted Acknowledgement"; the
 *   first-post template never goes out): S15 asserts the acknowledgement
 *   template-neutrally — a mail whose subject contains "Posted
 *   Acknowledgement" — so neither template title is frozen as contract.
 * - OPS5 ❓ (the "published" vocabulary leftovers): the "Publication
 *   Published" author mail's ARRIVAL is asserted (probe-verified send, all
 *   apps); its body wording, the task notice's "was published" verb and the
 *   submission header pill are not asserted.
 * - OPS3 ❓ (plugin-granted author self-posting has no surface): only the
 *   stock no-Post-control side is asserted (S16); the plugin leg is
 *   unverifiable on a stock install.
 * - A1 ❓ (who the new-version email reaches): S4 asserts only the
 *   stage-assigned Moderator's receipt — the recipient both readings agree
 *   on; the submitting author's copy is not asserted either way. OPS has no
 *   reviewers, so the reviewer-silence leg has no OPS surface.
 * - A5 🐞 (the amendment notice reaches no reader page): S5 fills Update
 *   Type and Summary of Changes but never asserts the reader-side presence
 *   or absence of the summary.
 * - A6 🐞 (an unpublished draft rewrites the public date line): S4 asserts
 *   the reader still gets the OLD version's content; the date line is not
 *   asserted either way.
 * - A7 ❓ (the requirement-shaped stage sentence under "All … met"): the
 *   first-post window is only asserted to name "Author Original 1.0"; the
 *   "must have a version stage assigned" sentence is not asserted.
 * - A2 ❓ / A3 ❓ / A4 ❓: S8 asserts what the screens offer per scenario 8
 *   (the absent controls and the dead-end stage button); the server-side
 *   roster mismatch is a code observation with no screen surface. A3 has no
 *   OPS surface (Author Original IS the final stage) and A4's stage-switch
 *   re-select needs a second stage OPS does not have.
 * - Rule 12's "Minor greyed on a stage with no versions" leg: needs a
 *   second stage — no OPS surface (S6 covers the numbering OPS can reach).
 * - Rule 16 (Send to Text Editor), Rule 17 (the awaiting-approval banner —
 *   OMP-only surface), the "Preprint Posted" settings flip, and the
 *   workflow-closes-on-Done log lines: no canonical scenario claims them
 *   here.
 * - OJS1 🐞, OMP1 ❓, Rules 3/5/14/15 and scenarios 11–14: journal- or
 *   press-only surfaces.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only — PK tests mutate only their own seeded submissions; every
 * Mailpit assertion runs on a scratch preprint server with throwaway
 * unique-recipient users (A8). Waits are event-based (publish/unpublish/
 * version API responses, the "Saved" form status, web-first assertions) —
 * no hard-coded sleeps. Everything runs in the parallel `ops` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    PublicationScreen,
    openWorkflow,
    postPreprint,
    unpostPreprint,
} = require('../pages/PublicationPages.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

const PK = 'publicknowledge';
const PK_PREFIX = '/en';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u49${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** Throwaway user spec for scratch servers (manager + author; optional moderator). */
function contextUsers(tag, {moderator = false} = {}) {
    const users = [
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
    if (moderator) {
        users.push({
            username: `${tag}md`,
            givenName: 'Mia',
            familyName: 'Moderator',
            email: `${tag}md@mail.test`,
            roles: ['sectionEditor'],
        });
    }
    return users;
}

/**
 * The "Status: {state}" readout strip on a Publication page
 * (WorkflowPublicationVersionControl inside workflow-controls-left).
 */
function statusStrip(page) {
    return page.locator('[data-cy="workflow-controls-left"]');
}

/** Assert the readout ("Posted" never false-matches "Unposted" — case). */
async function expectStatus(page, label) {
    await expect(statusStrip(page)).toContainText('Status:', {timeout: 30_000});
    await expect(statusStrip(page)).toContainText(label, {timeout: 30_000});
}

/**
 * Open the workflow straight onto one menu entry (the side menu mirrors its
 * selection into the `workflowMenuKey` query param — useWorkflowMenu), so a
 * SPECIFIC version's page can be reached without walking the nested menu.
 */
async function openMenuKey(page, contextPath, submissionId, menuKey, {author = false, heading} = {}) {
    const dashboard = author ? 'mySubmissions' : 'editorial';
    await page.goto(
        `/index.php/${contextPath}/dashboard/${dashboard}?workflowSubmissionId=${submissionId}&workflowMenuKey=${menuKey}`
    );
    await expect(
        page.getByRole('heading', {name: heading ?? 'Preprint: Title & Abstract'})
    ).toBeVisible({timeout: 30_000});
}

/**
 * Open the "Post the preprint" window from an open workflow (stage view or
 * any Publication page) and return the modal, located by content unique to
 * the window (the workflow panel is itself a dialog — patterns.md pitfall 6).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string|RegExp} contentFilter text unique to the expected window
 */
async function openPostWindow(page, contentFilter) {
    const stageAction = page.getByRole('button', {name: 'Post the preprint', exact: true});
    const postControl = page.getByRole('button', {name: 'Post', exact: true});
    await expect(stageAction.or(postControl).first()).toBeVisible({timeout: 30_000});
    if (await stageAction.isVisible()) {
        await stageAction.click();
    }
    await expect(postControl).toBeVisible({timeout: 30_000});
    await postControl.click();
    // The modal wrapper reports visibility:hidden (patterns.md pitfall 5) —
    // anchor on the role=dialog element, disambiguated from the workflow
    // panel (itself a dialog) by content unique to the window.
    const dialog = page.getByRole('dialog').filter({hasText: contentFilter});
    await expect(dialog).toBeVisible({timeout: 30_000});
    return dialog;
}

/** Confirm an open post window, bounded by the publish API answering OK. */
async function confirmPostWindow(page, dialog) {
    const posted = page.waitForResponse(
        (r) => /\/publications\/\d+\/publish/.test(r.url()) && r.ok(),
        {timeout: 30_000}
    );
    await dialog.getByRole('button', {name: 'Post', exact: true}).last().click();
    await posted;
}

/**
 * Unschedule the shown scheduled version: "Unschedule" opens a red confirm
 * dialog whose confirm button repeats the action name (Rule 9; OPS locale
 * wording live in ops/locale/en/submission.po).
 */
async function unschedulePreprint(page) {
    await page.getByRole('button', {name: 'Unschedule', exact: true}).click();
    const dialog = page
        .getByRole('dialog')
        .filter({hasText: "Are you sure you don't want this to be scheduled to be posted?"});
    await expect(dialog).toBeVisible({timeout: 30_000});
    const done = page.waitForResponse(
        (r) => /\/publications\/\d+\/unpublish/.test(r.url()) && r.ok(),
        {timeout: 30_000}
    );
    await dialog.getByRole('button', {name: 'Unschedule', exact: true}).last().click();
    await done;
    await expect(dialog).toHaveCount(0, {timeout: 30_000});
}

/** The "Create New Version" dialog, anchored on its own form control. */
function versionDialog(page) {
    return page
        .getByRole('dialog')
        .filter({has: page.locator('#version-versionSource-control')});
}

/**
 * Create a new version through the side menu's dialog, untouched unless a
 * mutator is given; returns the new publication JSON from the POST.
 *
 * @param {import('@playwright/test').Page} page
 * @param {(dialog: import('@playwright/test').Locator) => Promise<void>} [mutate]
 */
async function createNewVersionViaDialog(page, mutate) {
    await page.getByRole('link', {name: 'Create New Version', exact: true}).click();
    const dialog = versionDialog(page);
    await expect(dialog.locator('#version-versionSource-control')).toBeVisible({
        timeout: 30_000,
    });
    if (mutate) {
        await mutate(dialog);
    }
    const created = page.waitForResponse(
        (r) =>
            /\/publications\/\d+\/version/.test(r.url()) &&
            r.request().method() === 'POST' &&
            r.ok(),
        {timeout: 30_000}
    );
    await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
    const publication = await (await created).json();
    await expect(dialog).toHaveCount(0, {timeout: 30_000});
    return publication;
}

/** Open the bell Tasks panel (legacy grid modal; a visible "No Items" row
 * when empty bounds the read). */
async function openTasksPanel(page) {
    await page.getByRole('button', {name: /^Tasks/}).first().click();
    const panel = page.locator('[data-cy="active-modal"]').last();
    await expect(panel.getByRole('table').first()).toBeVisible({timeout: 30_000});
    return panel;
}

/** Assert an Activity Log line on the open workflow, then close the modal.
 * The workflow panel is itself an active-modal, so the log modal is
 * anchored by its own grid title, not by stacking order. */
async function expectActivityLogLine(page, text) {
    await page.getByRole('button', {name: 'Activity Log', exact: true}).click();
    const logModal = page
        .locator('[data-cy="active-modal"]')
        .filter({hasText: 'Activity Log & Notes'});
    await expect(logModal.getByText('Activity Log & Notes')).toBeVisible({
        timeout: 30_000,
    });
    await waitForJQueryIdle(page);
    await expect(logModal.getByText(text).first()).toBeVisible({timeout: 30_000});
    await logModal.getByRole('button', {name: 'Close'}).first().click();
    await expect(logModal).toHaveCount(0, {timeout: 30_000});
}

/** Fill "Date Posted" on the OPEN Preprint entry page and save (the form is
 * `issueEntry`; its save PUTs onto the publication — tunneled POST). */
async function saveDatePosted(page, screen, date) {
    const dateInput = screen.input('issueEntry', 'datePublished');
    await expect(dateInput).toBeVisible({timeout: 30_000});
    await dateInput.fill(date);
    await screen.save();
}

/** A date string one year ahead (schedules) / a fixed past date (backdates). */
function futureDate() {
    const d = new Date();
    return `${d.getFullYear() + 1}-12-01`;
}

test.describe('Publish, schedule & versions (U49)', () => {
    test('S1: post a preprint and see it live', {tag: '@smoke'}, async ({asUser, opsApi, page, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const title = `Preprint ${tag}`;
        await opsApi.createContext({tag, users: contextUsers(tag)});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title,
        });

        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await openWorkflow(managerPage, tag, submissionId);

        // The stage view's "Post the preprint" button lands on the
        // Publication area; the head reads "Status: Unposted" (Rule 1,
        // scenario 1's OPS wording).
        await managerPage
            .getByRole('button', {name: 'Post the preprint', exact: true})
            .click();
        await expect(
            managerPage.getByRole('heading', {name: 'Preprint: Title & Abstract'})
        ).toBeVisible({timeout: 30_000});
        await expectStatus(managerPage, 'Unposted');

        // The confirmation window states all requirements are met and names
        // the version to be assigned (Rule 4; the OPS opening line has no
        // "publication"). The requirement-shaped stage sentence is A7's —
        // only the version name is asserted.
        const dialog = await openPostWindow(
            managerPage,
            'Are you sure you want to post this?'
        );
        await expect(dialog).toContainText('Post the preprint');
        await expect(dialog).toContainText('All requirements have been met.');
        await expect(dialog).toContainText('Author Original 1.0');
        await confirmPostWindow(managerPage, dialog);

        // "Status: Posted", the offered control flips to "Unpost" (Rule 9's
        // precondition).
        await expect(
            managerPage.getByRole('button', {name: 'Unpost', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expectStatus(managerPage, 'Posted');

        // The reader page is live (anonymous context; scratch servers are
        // single-locale — probe bare, patterns.md lesson 9).
        await page.goto(`/index.php/${tag}/preprint/view/${submissionId}`);
        await expect(page.getByRole('heading', {name: title})).toBeVisible({
            timeout: 30_000,
        });

        // The activity log gained the OPS-worded line (Side effects).
        await expectActivityLogLine(managerPage, 'The submission was posted.');

        // The submitting author receives the "Publication Published" email
        // (probe-verified: OPS sends it too) — recipient-scoped (A8) with
        // the tag as content marker — and a task notice naming the preprint
        // (its "was published" verb is OPS5's ❓ and is not asserted).
        await pkpMail.find({
            to: `${tag}au@mail.test`,
            subject: 'Publication Published',
            contains: tag,
            timeoutMs: 30_000,
        });
        const authorPage = await (await asUser(`${tag}au`)).newPage();
        await authorPage.goto(`/index.php/${tag}/dashboard/mySubmissions`);
        const tasks = await openTasksPanel(authorPage);
        await expect(tasks.getByText(title).first()).toBeVisible({timeout: 30_000});
    });

    test('S2: a declined preprint cannot be posted', async ({asUser, opsApi}, testInfo) => {
        const tag = makeTag('s2', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Preprint ${tag}`,
            decisions: ['decline'],
        });

        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);

        // A preprint server opens the refused window directly (Rule 7 — no
        // details panel): the requirements heading, the declined line, and
        // no confirm button at all (Rule 4; the confirm-state window of
        // S1/S15 is the same-way positive control for the button's absence).
        await expectStatus(managerPage, 'Unposted');
        const dialog = await openPostWindow(
            managerPage,
            'The following requirements must be met before this can be posted.'
        );
        await expect(dialog).toContainText('A declined submission can not be posted.');
        await expect(
            dialog.getByRole('button', {name: 'Post', exact: true})
        ).toHaveCount(0);

        // Close; the status is unchanged.
        await managerPage.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
        await expectStatus(managerPage, 'Unposted');
    });

    test('S3: unpost takes the preprint down and clears the author notice', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const title = `Preprint ${tag}`;
        await opsApi.createContext({tag, users: contextUsers(tag)});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title,
            published: true,
        });

        // Positive controls for what the unpost must undo: the posting task
        // notice is in the author's Tasks and the reader page is live.
        const authorPage = await (await asUser(`${tag}au`)).newPage();
        await authorPage.goto(`/index.php/${tag}/dashboard/mySubmissions`);
        const tasksBefore = await openTasksPanel(authorPage);
        await expect(tasksBefore.getByText(title).first()).toBeVisible({
            timeout: 30_000,
        });
        await page.goto(`/index.php/${tag}/preprint/view/${submissionId}`);
        await expect(page.getByRole('heading', {name: title})).toBeVisible({
            timeout: 30_000,
        });

        // "Unpost" asks "Are you sure you don't want this to be posted?"
        // (Rule 9, OPS wording — asserted inside the helper); confirming
        // returns the readout to "Unposted".
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await openWorkflow(managerPage, tag, submissionId);
        await expectStatus(managerPage, 'Posted');
        await unpostPreprint(managerPage);
        await expectStatus(managerPage, 'Unposted');

        // The reader page is gone (bounded by the pre-unpost 200 above).
        const response = await page.goto(
            `/index.php/${tag}/preprint/view/${submissionId}`
        );
        expect(response?.status()).toBe(404);

        // The log gained the OPS-worded line; the author's task notice is
        // gone again — their Tasks grid reads "No Items" (scenario 3).
        await expectActivityLogLine(managerPage, 'The submission was unposted.');
        await authorPage.reload();
        const tasksAfter = await openTasksPanel(authorPage);
        await expect(tasksAfter.getByText('No Items')).toBeVisible({timeout: 30_000});
        await expect(tasksAfter.getByText(title)).toHaveCount(0);
    });

    test('S4: create a new version', async ({asUser, opsApi, page, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const title = `Preprint ${tag}`;
        await opsApi.createContext({tag, users: contextUsers(tag, {moderator: true})});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title,
            published: true,
            participants: [{username: `${tag}md`, role: 'sectionEditor'}],
        });

        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await openWorkflow(managerPage, tag, submissionId);
        await expect(
            managerPage.getByRole('link', {name: 'Author Original 1.0', exact: true})
        ).toBeVisible({timeout: 30_000});

        // The dialog arrives pre-answered on a stage-assigned source
        // (Rule 11 / fn-i): the copied version as source, its stage, and
        // "Minor Revision".
        const newPublication = await createNewVersionViaDialog(managerPage, async (dialog) => {
            await expect(
                dialog.locator('#version-versionSource-control option:checked')
            ).toHaveText('Author Original 1.0');
            await expect(
                dialog.locator('#version-versionStage-control option:checked')
            ).toHaveText('Author Original (AO)');
            await expect(
                dialog.locator('#version-versionIsMinor-control option:checked')
            ).toHaveText('Minor Revision');
        });

        // The menu gains "Author Original 1.1"; its pages open with
        // "Status: Unpublished" (a queued NON-current version — fn-g) and
        // the copied content.
        await expect(
            managerPage.getByRole('link', {name: 'Author Original 1.1', exact: true})
        ).toBeVisible({timeout: 30_000});
        const screen = new PublicationScreen(managerPage);
        await openMenuKey(
            managerPage,
            tag,
            submissionId,
            `publication_${newPublication.id}_titleAbstract`
        );
        await expectStatus(managerPage, 'Unpublished');
        await expect(screen.richTextBody('titleAbstract', 'title', 'en')).toContainText(
            title,
            {timeout: 30_000}
        );

        // Mark the draft so the reader-side assertion can tell the versions
        // apart, then check readers still get the OLD version (Rule 11; the
        // shifted date line is A6's 🐞 and is not asserted either way).
        await screen.fillRichText('titleAbstract', 'title', 'en', `${title} vNext`);
        await screen.save();
        await page.goto(`/index.php/${tag}/preprint/view/${submissionId}`);
        await expect(page.getByRole('heading', {name: title, exact: true})).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.getByText(`${title} vNext`)).toHaveCount(0);

        // The stage-assigned Moderator gets the "A new version was
        // created…" email and its task notice (Side effects; the wider
        // audience question is A1's ❓ — only the editor-side receipt both
        // readings agree on is asserted).
        await pkpMail.find({
            to: `${tag}md@mail.test`,
            subject: 'A new version was created',
            contains: tag,
            timeoutMs: 30_000,
        });
        const moderatorPage = await (await asUser(`${tag}md`)).newPage();
        await moderatorPage.goto(`/index.php/${tag}/dashboard/editorial`);
        const tasks = await openTasksPanel(moderatorPage);
        await expect(
            tasks.getByText('A new version of a submission was created').first()
        ).toBeVisible({timeout: 30_000});
    });

    test('S5: post the new version', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const title = `Preprint ${tag}`;
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title,
            published: true,
        });

        // Setup (scenario 4's state, not under test here): a new version.
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        const newPublication = await createNewVersionViaDialog(managerPage);

        // Fill an Update Type ("Correction") and a Summary of Changes on
        // the new version's Preprint entry page (scenario 5). The summary
        // box carries NO "Insert Content" button on a preprint server
        // (Rule 14 — the field itself, visible, bounds the absence; the
        // button's presence is OJS/OMP's leg).
        const screen = new PublicationScreen(managerPage);
        await openMenuKey(
            managerPage,
            PK,
            submissionId,
            `publication_${newPublication.id}_preprintEntry`,
            {heading: 'Preprint: Preprint entry'}
        );
        await managerPage
            .locator('#issueEntry-updateType-control')
            .selectOption({label: 'Correction'});
        const summaryWrapper = screen.fieldWrapper('issueEntry', 'summaryOfChanges', 'en');
        await expect(summaryWrapper).toBeVisible({timeout: 30_000});
        await expect(
            summaryWrapper.getByRole('button', {name: 'Insert Content'})
        ).toHaveCount(0);
        await screen.fillRichText(
            'issueEntry',
            'summaryOfChanges',
            'en',
            `Corrected results ${tag}.`
        );
        await screen.save();

        // Mark the new version's title so the reader swap is observable,
        // then post it: the window names the already-assigned version
        // (Rule 4's staged form) and confirming yields "Status: Posted".
        await openMenuKey(
            managerPage,
            PK,
            submissionId,
            `publication_${newPublication.id}_titleAbstract`
        );
        await screen.fillRichText('titleAbstract', 'title', 'en', `${title} v2`);
        await screen.save();
        const dialog = await openPostWindow(
            managerPage,
            'Are you sure you want to post this?'
        );
        await expect(dialog).toContainText(
            'The publication version is "Author Original 1.1"'
        );
        await confirmPostWindow(managerPage, dialog);
        await expect(
            managerPage.getByRole('button', {name: 'Unpost', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expectStatus(managerPage, 'Posted');

        // The reader page now serves the new version and its "Versions"
        // list gains the new entry (scenario 5; the saved summary's reader
        // absence is A5's 🐞 — not asserted). The log adds the OPS-worded
        // "A new version was posted."
        await page.goto(`/index.php/${PK}${PK_PREFIX}/preprint/view/${submissionId}`);
        await expect(
            page.getByRole('heading', {name: `${title} v2`})
        ).toBeVisible({timeout: 30_000});
        const versionsBlock = page.locator('.sub_item.versions');
        await expect(versionsBlock).toContainText('(Author Original 1.1)');
        await expect(versionsBlock).toContainText('(Author Original 1.0)');
        await expectActivityLogLine(managerPage, 'A new version was posted.');
    });

    test('S6: minor and major numbering', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Preprint ${tag}`,
            published: true,
        });

        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);

        // A preprint server knows a single stage (Rule 12): the dialog's
        // Publication Stage offers only "Author Original (AO)" — the AO
        // option's presence bounds the Version-of-Record absence. With an
        // AO version existing, "Minor Revision" is selectable (and
        // preselected — fn-i); an untouched Confirm yields "… 1.1".
        await createNewVersionViaDialog(managerPage, async (dialog) => {
            const stageOptions = dialog.locator('#version-versionStage-control option');
            await expect(stageOptions.filter({hasText: 'Author Original (AO)'})).toHaveCount(1);
            await expect(stageOptions.filter({hasText: 'Version of Record'})).toHaveCount(0);
            const minorOption = dialog
                .locator('#version-versionIsMinor-control option')
                .filter({hasText: 'Minor Revision'});
            await expect(minorOption).toBeEnabled();
            await expect(
                dialog.locator('#version-versionIsMinor-control option:checked')
            ).toHaveText('Minor Revision');
        });
        await expect(
            managerPage.getByRole('link', {name: 'Author Original 1.1', exact: true})
        ).toBeVisible({timeout: 30_000});

        // A major revision starts the stage's next whole number: "2.0".
        await createNewVersionViaDialog(managerPage, async (dialog) => {
            await dialog
                .locator('#version-versionIsMinor-control')
                .selectOption({label: 'Major Revision'});
        });
        await expect(
            managerPage.getByRole('link', {name: 'Author Original 2.0', exact: true})
        ).toBeVisible({timeout: 30_000});
    });

    test('S7: the version list and the author\'s view', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const title = `Preprint ${tag}`;
        const {submissionId, publicationId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title,
            published: true,
        });

        // Setup: a second version exists (scenario 7's state).
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        const newPublication = await createNewVersionViaDialog(managerPage);

        // The submitting Author's tracking view (My Submissions): the side
        // menu lists every version by name; each page heads with the status
        // readout; no post, unpost or Create-New-Version control anywhere.
        const authorPage = await (await asUser('author.alex')).newPage();
        await openWorkflow(authorPage, PK, submissionId, {author: true});
        await expect(
            authorPage.getByRole('link', {name: 'Author Original 1.0', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(
            authorPage.getByRole('link', {name: 'Author Original 1.1', exact: true})
        ).toBeVisible();

        await openMenuKey(
            authorPage,
            PK,
            submissionId,
            `publication_${publicationId}_titleAbstract`,
            {author: true}
        );
        await expectStatus(authorPage, 'Posted');
        await openMenuKey(
            authorPage,
            PK,
            submissionId,
            `publication_${newPublication.id}_titleAbstract`,
            {author: true}
        );
        await expectStatus(authorPage, 'Unpublished');
        await expect(
            authorPage.getByRole('button', {name: 'Post', exact: true})
        ).toHaveCount(0);
        await expect(
            authorPage.getByRole('button', {name: 'Unpost', exact: true})
        ).toHaveCount(0);
        await expect(
            authorPage.getByRole('link', {name: 'Create New Version', exact: true})
        ).toHaveCount(0);

        // Positive control, taken the same way: the manager's view of the
        // SAME versions offers Unpost (published version) and the
        // Create-New-Version item.
        await openMenuKey(
            managerPage,
            PK,
            submissionId,
            `publication_${publicationId}_titleAbstract`
        );
        await expect(
            managerPage.getByRole('button', {name: 'Unpost', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(
            managerPage.getByRole('link', {name: 'Create New Version', exact: true})
        ).toBeVisible();
    });

    test('S8: the Moderator gets the version pages but no publish controls', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Preprint ${tag}`,
        });

        // The PRE section's Moderators (sectioneditor.ana among them) are
        // stage-assigned by the real submit's AssignEditors — the assigned
        // Moderator of scenario 8.
        const moderatorPage = await (await asUser('sectioneditor.ana')).newPage();
        await openWorkflow(moderatorPage, PK, submissionId);

        // The Production stage view still shows the "Post the preprint"
        // button; pressing it only lands on the Publication area (A2's
        // dead-end shortcut, asserted as scenario 8 instructs).
        const stageAction = moderatorPage.getByRole('button', {
            name: 'Post the preprint',
            exact: true,
        });
        await expect(stageAction).toBeVisible({timeout: 30_000});
        await stageAction.click();
        await expect(
            moderatorPage.getByRole('heading', {name: 'Preprint: Title & Abstract'})
        ).toBeVisible({timeout: 30_000});

        // The version pages are there — the status readout renders — but
        // the publish controls and "Create New Version" are not.
        await expectStatus(moderatorPage, 'Unposted');
        await expect(
            moderatorPage.getByRole('button', {name: 'Post', exact: true})
        ).toHaveCount(0);
        await expect(
            moderatorPage.getByRole('button', {name: 'Unpost', exact: true})
        ).toHaveCount(0);
        await expect(
            moderatorPage.getByRole('link', {name: 'Create New Version', exact: true})
        ).toHaveCount(0);

        // Positive control, same submission, same way: the manager sees
        // both controls.
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        await managerPage
            .getByRole('button', {name: 'Post the preprint', exact: true})
            .click();
        await expect(
            managerPage.getByRole('button', {name: 'Post', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(
            managerPage.getByRole('link', {name: 'Create New Version', exact: true})
        ).toBeVisible();
    });

    test('S9: unschedule a future-dated preprint', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s9', testInfo);
        const {submissionId, publicationId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Preprint ${tag}`,
        });

        // A FUTURE "Date Posted" saved on Preprint entry is what schedules
        // (Rule 6); posting then yields "Status: Scheduled" — the scheduled
        // STATE is contract; that nothing ever posts it is OPS1's 🐞 and
        // the window's unchanged wording is not asserted either way.
        const managerPage = await (await asUser('manager.maya')).newPage();
        const screen = new PublicationScreen(managerPage);
        await openMenuKey(
            managerPage,
            PK,
            submissionId,
            `publication_${publicationId}_preprintEntry`,
            {heading: 'Preprint: Preprint entry'}
        );
        await saveDatePosted(managerPage, screen, futureDate());
        const dialog = await openPostWindow(
            managerPage,
            'Are you sure you want to post this?'
        );
        await confirmPostWindow(managerPage, dialog);

        // The offered controls become "Preview" and "Unschedule" (Rule 6 /
        // fn-ops1's probed control set); the Post button is gone — bounded
        // by Unschedule having rendered.
        await expect(
            managerPage.getByRole('button', {name: 'Unschedule', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expectStatus(managerPage, 'Scheduled');
        // Scope to the publication controls: the stage header carries its
        // own Preview button too.
        const controlsRight = managerPage.locator('[data-cy="workflow-controls-right"]');
        await expect(
            controlsRight.getByRole('button', {name: 'Preview', exact: true})
        ).toBeVisible();
        await expect(
            controlsRight.getByRole('button', {name: 'Post', exact: true})
        ).toHaveCount(0);

        // "Unschedule" asks the OPS-worded question and returns the version
        // to "Unposted" (scenario 9 / Rule 9).
        await unschedulePreprint(managerPage);
        await expectStatus(managerPage, 'Unposted');
    });

    test('S10: republish with what was kept', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        const title = `Preprint ${tag}`;
        const keptDate = '2020-02-02';
        const {submissionId, publicationId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title,
        });

        // Backdate on Preprint entry (Rule 8: a filled date is kept, even a
        // past one), then post — live at once, carrying the entered date.
        const managerPage = await (await asUser('manager.maya')).newPage();
        const screen = new PublicationScreen(managerPage);
        const entryKey = `publication_${publicationId}_preprintEntry`;
        await openMenuKey(managerPage, PK, submissionId, entryKey, {
            heading: 'Preprint: Preprint entry',
        });
        await saveDatePosted(managerPage, screen, keptDate);
        const dialog = await openPostWindow(
            managerPage,
            'Are you sure you want to post this?'
        );
        await confirmPostWindow(managerPage, dialog);
        await expect(
            managerPage.getByRole('button', {name: 'Unpost', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expectStatus(managerPage, 'Posted');
        await page.goto(`/index.php/${PK}${PK_PREFIX}/preprint/view/${submissionId}`);
        await expect(page.getByRole('heading', {name: title})).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.locator('.item.published')).toContainText(keptDate);

        // Unpost: the date survives on Preprint entry (Rule 9 keeps it).
        await unpostPreprint(managerPage);
        await expectStatus(managerPage, 'Unposted');
        await openMenuKey(managerPage, PK, submissionId, entryKey, {
            heading: 'Preprint: Preprint entry',
        });
        await expect(screen.input('issueEntry', 'datePublished')).toHaveValue(
            keptDate,
            {timeout: 30_000}
        );

        // Re-post: the kept (past) date sends it straight back to "Posted"
        // carrying the ORIGINAL date (Rule 10 / scenario 10).
        const redoDialog = await openPostWindow(
            managerPage,
            'Are you sure you want to post this?'
        );
        await confirmPostWindow(managerPage, redoDialog);
        await expect(
            managerPage.getByRole('button', {name: 'Unpost', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expectStatus(managerPage, 'Posted');
        await page.goto(`/index.php/${PK}${PK_PREFIX}/preprint/view/${submissionId}`);
        await expect(page.getByRole('heading', {name: title})).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.locator('.item.published')).toContainText(keptDate);
    });

    test('S15: the Post window, the acknowledgement, and the future-date leg', async ({asUser, opsApi, page, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('o15', testInfo);
        const title = `Preprint ${tag}`;
        await opsApi.createContext({tag, users: contextUsers(tag)});
        const [{submissionId}, scheduled] = await Promise.all([
            opsApi.createSubmission({
                tag: `${tag}a`,
                context: tag,
                submitter: `${tag}au`,
                title,
            }),
            opsApi.createSubmission({
                tag: `${tag}b`,
                context: tag,
                submitter: `${tag}au`,
                title: `Preprint ${tag}b`,
            }),
        ]);

        // The "Post the preprint" window: requirements met, the version to
        // be assigned, and the preprint's related-publication line
        // (scenario 15; the requirement-shaped stage sentence is A7's ❓
        // and is not asserted).
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await openWorkflow(managerPage, tag, submissionId);
        const dialog = await openPostWindow(
            managerPage,
            'Are you sure you want to post this?'
        );
        await expect(dialog).toContainText('Post the preprint');
        await expect(dialog).toContainText('All requirements have been met.');
        await expect(dialog).toContainText('Author Original 1.0');
        await expect(dialog).toContainText('Related Publication');
        await confirmPostWindow(managerPage, dialog);
        await expect(
            managerPage.getByRole('button', {name: 'Unpost', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expectStatus(managerPage, 'Posted');

        // The preprint page is live, and the contributor receives a posting
        // acknowledgement — matched template-neutrally by the shared
        // "…Posted Acknowledgement" subject tail, so neither template title
        // is frozen (OPS4 🐞 owns which one goes out).
        await page.goto(`/index.php/${tag}/preprint/view/${submissionId}`);
        await expect(page.getByRole('heading', {name: title})).toBeVisible({
            timeout: 30_000,
        });
        await pkpMail.find({
            to: `${tag}au@mail.test`,
            subject: 'Posted Acknowledgement',
            contains: tag,
            timeoutMs: 30_000,
        });

        // The future-date leg: a date saved on Preprint entry beforehand
        // yields "Status: Scheduled" instead, and the preprint page stays
        // down — the first preprint's live page above is the same-way
        // positive control. (That nothing will ever post it is OPS1's 🐞;
        // whether the acknowledgement should have gone out is OPS2's ❓ —
        // neither is asserted.)
        const screen = new PublicationScreen(managerPage);
        await openMenuKey(
            managerPage,
            tag,
            scheduled.submissionId,
            `publication_${scheduled.publicationId}_preprintEntry`,
            {heading: 'Preprint: Preprint entry'}
        );
        await saveDatePosted(managerPage, screen, futureDate());
        const scheduleDialog = await openPostWindow(
            managerPage,
            'Are you sure you want to post this?'
        );
        await confirmPostWindow(managerPage, scheduleDialog);
        await expect(
            managerPage.getByRole('button', {name: 'Unschedule', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expectStatus(managerPage, 'Scheduled');
        const response = await page.goto(
            `/index.php/${tag}/preprint/view/${scheduled.submissionId}`
        );
        expect(response?.status()).toBe(404);
    });

    test('S16: the author cannot post', async ({asUser, opsApi}, testInfo) => {
        const tag = makeTag('o16', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Preprint ${tag}`,
        });

        // The submitting author's workflow view offers no Post control
        // anywhere (Actors; the plugin-granted leg is OPS3's ❓ — only the
        // default-server side is asserted). The rendered readout bounds
        // the absence; the wizard's closing-screen texts are the
        // Submission wizard spec's.
        const authorPage = await (await asUser('author.alex')).newPage();
        await openWorkflow(authorPage, PK, submissionId, {author: true});
        await expectStatus(authorPage, 'Unposted');
        await expect(
            authorPage.getByRole('button', {name: 'Post', exact: true})
        ).toHaveCount(0);
        await expect(
            authorPage.getByRole('button', {name: 'Post the preprint', exact: true})
        ).toHaveCount(0);
        await expect(
            authorPage.getByRole('link', {name: 'Create New Version', exact: true})
        ).toHaveCount(0);

        // Positive control, same submission, same way: the manager's view
        // offers the Post flow.
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        await managerPage
            .getByRole('button', {name: 'Post the preprint', exact: true})
            .click();
        await expect(
            managerPage.getByRole('button', {name: 'Post', exact: true})
        ).toBeVisible({timeout: 30_000});
    });
});
