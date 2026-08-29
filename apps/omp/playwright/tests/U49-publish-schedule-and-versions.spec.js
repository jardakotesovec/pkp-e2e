// @ts-check
/**
 * @file playwright/tests/U49-publish-schedule-and-versions.spec.js
 *
 * Publish, schedule & versions — OMP suite: one test per canonical COMMON
 * scenario as a press runs it (spec scenarios 1–10, in OMP vocabulary:
 * press, press manager, monograph, catalog book page, "Publish" button whose
 * confirmation window is titled "Schedule For Publication", scheduling by a
 * future Date Published on the Catalog Entry page) plus the press-only
 * scenario 14. The press markers ride inside the common tests: the
 * awaiting-approval banner and its replacement pair (Rule 17, in S1), the
 * refused window opening directly on a declined monograph (Rule 7's press
 * leg, in S2), and the date-route scheduling behind S9's Unschedule.
 * Spec: docs/specs/U49-publish-schedule-and-versions.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - A5 🐞 (the published Summary of Changes appears on no reader page): S5
 *   fills Update Type "Correction" and a Summary of Changes and publishes,
 *   but never asserts the amendment notice's presence OR absence anywhere.
 * - A6 🐞 (creating an unpublished draft rewrites the reader page's date
 *   line): S4 asserts the old version is still served via the catalog
 *   page's "Versions" list and the new abstract's absence — the date line
 *   is never asserted.
 * - OMP1 ❓ (the publish window still promises "…make this catalog entry
 *   public?" when a future date will schedule it): S9/S14 confirm the
 *   window without asserting its wording.
 * - A7 ❓ (the requirement-shaped stage sentence under "All … met"): S1
 *   asserts only the all-met line and the named version, not the sentence
 *   shape around it.
 * - A1 ❓ (the new-version email reaches every stage-assigned user, the
 *   author included, though it presents itself as an editor notice): S4
 *   asserts the participating editor's email + task notice and the
 *   assigned reviewer's silence (editor receipt as the positive control);
 *   the submitting author's receipt is parked on A1 and asserted neither
 *   way.
 * - A2 ❓ (screen vs plumbing publisher rosters): S8 asserts the on-screen
 *   absence for the assigned Series Editor and Layout Editor with the
 *   manager as positive control — the server-side roster is never probed.
 *   (The Production stage view's "Schedule For Publication" button reaches
 *   OMP through the OJS editorial config deep-merge —
 *   useWorkflowConfigOMP.js; S8 presses it per the scenario.)
 * - A3 ❓ (a published non-final version leaves the submission listed
 *   unpublished) and A4 ❓ (a stage switch re-selects "Minor Revision"):
 *   S6 asserts the disabled/enabled Minor option and the resulting version
 *   numbers only — neither the dashboards' rollup nor the re-selection.
 * - Rule 16 (Send to Text Editor) has no canonical scenario and needs an
 *   uploaded production file; not covered here.
 * - S14's tail — the once-daily background check publishing the book when
 *   its date arrives (JOB-050) — is unobservable on a future date and
 *   would need the serial scheduler runner with a date the app itself
 *   won't let the test move past; the scheduled state and controls are
 *   asserted, the later release is not.
 * - Side effects owned elsewhere (DOI deposit, ORCID deposit, search
 *   index, catalog availability swaps) are not asserted.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only (mail- and task-scoped tests run on scratch presses with
 * throwaway users; publicknowledge tests only add their own tagged
 * submissions, per PRINCIPLES A1). Mailpit assertions are scoped by unique
 * throwaway recipients (A8); every absence claim carries a positive control
 * taken the same way. Waits are event-based (publish/version/unpublish API
 * responses, the form footer's "Saved" status, web-first assertions) — no
 * hard-coded sleeps. Everything runs in the parallel `omp` project.
 */
const {test, expect} = require('../support/fixtures.js');

const PK = 'publicknowledge';
const PK_PREFIX = '/en';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u49omp${scenario}w${testInfo.parallelIndex}${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}

/** Throwaway manager+author users for a scratch press. */
function scratchUsers(tag, extra = []) {
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
        ...extra,
    ];
}

/**
 * Open a monograph's workflow view (editorial or author dashboard) and wait
 * for the Publication group to render. An optional menuKey deep-links to one
 * version's page via the app's own workflowMenuKey query parameter.
 */
async function openWorkflow(
    page,
    contextPath,
    submissionId,
    {author = false, menuKey = null} = {}
) {
    const dashboard = author ? 'mySubmissions' : 'editorial';
    const keyParam = menuKey ? `&workflowMenuKey=${menuKey}` : '';
    await page.goto(
        `/index.php/${contextPath}/dashboard/${dashboard}?workflowSubmissionId=${submissionId}${keyParam}`
    );
    await expect(
        page.getByRole('link', {name: 'Publication', exact: true})
    ).toBeVisible({timeout: 30_000});
}

/**
 * From an open workflow view, open one of the Publication group's pages and
 * wait for its "Publication: {entry}" heading. The group is expanded by
 * default — clicking "Publication" would collapse it, so it is only clicked
 * when the entry is hidden. With several versions expanded the entry link
 * can exist more than once — deep-link via openWorkflow's menuKey instead.
 */
async function openPublicationPage(page, entry) {
    const link = page.getByRole('link', {name: entry, exact: true}).first();
    if (!(await link.isVisible())) {
        await page.getByRole('link', {name: 'Publication', exact: true}).click();
    }
    await link.click();
    await expect(
        page.getByRole('heading', {name: `Publication: ${entry}`})
    ).toBeVisible({timeout: 30_000});
}

/** The status readout container ("Status:" + colored dot + state label). */
function statusReadout(page) {
    return page.locator('div:has(> span:text-is("Status:"))');
}

/** Assert the Publication head's status readout. */
async function expectStatus(page, label) {
    await expect(statusReadout(page)).toContainText(label, {timeout: 30_000});
}

/** A form field's container, located by its (primary) label text. */
function field(page, labelRe) {
    return page
        .locator('.pkpFormField')
        .filter({has: page.locator('label.pkpFormFieldLabel').filter({hasText: labelRe})});
}

/** The TinyMCE body of a rich-text field (first = submission-language column). */
function richBody(page, labelRe) {
    return field(page, labelRe).frameLocator('iframe').first().locator('body');
}

/**
 * Press Save on a publication page's form, bounded by the publications API
 * answering OK (useFetch tunnels PUT via POST) and the footer's "Saved"
 * status appearing.
 */
async function savePublicationForm(page) {
    const saved = page.waitForResponse(
        (r) =>
            /\/submissions\/\d+\/publications\/\d+/.test(r.url()) &&
            r.request().method() === 'POST' &&
            r.ok(),
        {timeout: 30_000}
    );
    await page.getByRole('button', {name: 'Save', exact: true}).click();
    await saved;
    await expect(
        page.locator('.pkpFormPage__status', {hasText: 'Saved'})
    ).toBeVisible({timeout: 30_000});
}

/**
 * Press the top-right "Publish" button and wait for the confirmation window
 * (titled "Schedule For Publication" even on a press — Rule 2's OMP leg).
 * Returns the modal locator; the caller asserts its content and confirms.
 */
async function openPublishModal(page) {
    await page.getByRole('button', {name: 'Publish', exact: true}).click();
    const modal = page.getByRole('dialog', {name: /Schedule For Publication/});
    await expect(modal).toBeVisible({timeout: 30_000});
    return modal;
}

/**
 * Confirm the publish window and wait for the publish endpoint plus the
 * control that proves the new state (Unpublish on a publish-now, Unschedule
 * on a future-dated schedule).
 */
async function confirmPublish(page, modal, {expectButton = 'Unpublish'} = {}) {
    const published = page.waitForResponse(
        (r) => r.url().includes('/publish') && r.ok(),
        {timeout: 30_000}
    );
    await modal.getByRole('button', {name: 'Publish', exact: true}).click();
    await published;
    await expect(
        page.getByRole('button', {name: expectButton, exact: true})
    ).toBeVisible({timeout: 30_000});
}

/** Full publish-now cycle from an open Publication page. */
async function publishFromWorkflow(page) {
    const modal = await openPublishModal(page);
    await confirmPublish(page, modal);
}

/** Unpublish the open workflow's current publication (confirm dialog). */
async function unpublishFromWorkflow(page) {
    await page.getByRole('button', {name: 'Unpublish', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Unpublish'});
    await expect(dialog).toBeVisible({timeout: 30_000});
    await expect(
        dialog.getByText("Are you sure you don't want this to be published?")
    ).toBeVisible();
    const unpublished = page.waitForResponse(
        (r) => r.url().includes('/unpublish') && r.ok(),
        {timeout: 30_000}
    );
    await dialog.getByRole('button', {name: 'Unpublish', exact: true}).click();
    await unpublished;
    await expect(
        page.getByRole('button', {name: 'Publish', exact: true})
    ).toBeVisible({timeout: 30_000});
}

/**
 * Set the Catalog Entry page's "Date Published" and save (the date route
 * that schedules a press item — Rule 6).
 */
async function saveDatePublished(page, value) {
    await openPublicationPage(page, 'Catalog Entry');
    await field(page, /^Date Published/).locator('input').first().fill(value);
    await savePublicationForm(page);
}

/** Open the Activity Log dialog and assert a line, then close it. */
async function expectLogLine(page, text) {
    await page.getByRole('button', {name: 'Activity Log', exact: true}).click();
    const log = page.getByRole('dialog', {name: /Activity Log/});
    await expect(log.getByText(text).first()).toBeVisible({timeout: 30_000});
    await page.keyboard.press('Escape');
    await expect(log).toHaveCount(0, {timeout: 30_000});
}

/** Open the dashboard Tasks dialog for the given context/dashboard. */
async function openTasks(page, contextPath, {author = false} = {}) {
    const dashboard = author ? 'mySubmissions' : 'editorial';
    await page.goto(`/index.php/${contextPath}/dashboard/${dashboard}`);
    await page.getByRole('button', {name: 'Tasks'}).click();
    return page.getByRole('dialog').filter({hasText: 'Tasks'});
}

/** The catalog book page URL (publicknowledge is bilingual → /en prefix). */
function bookUrl(contextPath, submissionId) {
    const prefix = contextPath === PK ? PK_PREFIX : '';
    return `/index.php/${contextPath}${prefix}/catalog/book/${submissionId}`;
}

/**
 * Open the Create New Version dialog from the side menu. Returns the dialog
 * locator (title "Create New Version", Confirm/Cancel footer).
 */
async function openCreateVersionDialog(page) {
    const item = page.getByRole('link', {name: 'Create New Version', exact: true});
    if (!(await item.isVisible())) {
        await page.getByRole('link', {name: 'Publication', exact: true}).click();
    }
    await item.click();
    const dialog = page.getByRole('dialog', {name: 'Create New Version'});
    await expect(dialog).toBeVisible({timeout: 30_000});
    // The dialog's selects arrive with the store's data; bound on the stage
    // select having rendered its options.
    await expect(dialog.getByLabel('Publication Stage')).toBeVisible({
        timeout: 30_000,
    });
    return dialog;
}

/**
 * Confirm the Create New Version dialog and return the new publication's id
 * (from the app's own POST …/version response).
 */
async function confirmCreateVersion(page, dialog) {
    const created = page.waitForResponse(
        (r) =>
            /\/publications\/\d+\/version/.test(r.url()) &&
            r.request().method() === 'POST' &&
            r.ok(),
        {timeout: 30_000}
    );
    await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
    const response = await created;
    const body = await response.json();
    await expect(dialog).toHaveCount(0, {timeout: 30_000});
    return body.id;
}

test.describe('Publish, schedule & versions (U49)', () => {
    test('S1: publish a monograph and see it live', {tag: '@smoke'}, async ({asUser, ompApi, page, pkpMail}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s1', testInfo);
        await ompApi.createContext({tag, users: scratchUsers(tag)});
        const {submissionId} = await ompApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
        });

        // Rule 17: while nothing is published the Production stage banners
        // the awaiting-approval notice.
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await openWorkflow(managerPage, tag, submissionId);
        await expect(managerPage.getByText('Awaiting approval.')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            managerPage.getByText(
                'The monograph will not be listed in the catalog until it has been published.'
            )
        ).toBeVisible();

        // The Publication area heads "Status: Unscheduled".
        await openPublicationPage(managerPage, 'Title & Abstract');
        await expectStatus(managerPage, 'Unscheduled');

        // The publish button reads "Publish"; its confirmation window is
        // titled "Schedule For Publication" even on a press (Rule 2), states
        // all requirements are met and names the version to be assigned.
        const modal = await openPublishModal(managerPage);
        await expect(
            modal.getByText('All publication requirements have been met.')
        ).toBeVisible();
        await expect(modal.getByText('Version of Record 1.0').first()).toBeVisible();
        await confirmPublish(managerPage, modal);
        await expectStatus(managerPage, 'Published');

        // Rule 17's replacement pair on the Production stage view.
        await managerPage.getByRole('link', {name: 'Production', exact: true}).click();
        await expect(managerPage.getByText('Submission published.')).toBeVisible({
            timeout: 30_000,
        });
        await expect(managerPage.getByText('Awaiting approval.')).toHaveCount(0);

        // The catalog book page is live (anonymous).
        await page.goto(bookUrl(tag, submissionId));
        await expect(page.getByText(`Submission ${tag}`).first()).toBeVisible({
            timeout: 30_000,
        });

        // Activity log: "The submission was published."
        await openWorkflow(managerPage, tag, submissionId);
        await expectLogLine(managerPage, 'The submission was published.');

        // The submitting author gets the "Publication Published" email …
        await pkpMail.find({
            to: `${tag}au@mail.test`,
            subject: 'Publication Published',
            contains: tag,
        });

        // … and the "was published" task notice.
        const authorPage = await (await asUser(`${tag}au`)).newPage();
        const tasks = await openTasks(authorPage, tag, {author: true});
        await expect(
            tasks.getByText(
                `A new version of your submission, "Submission ${tag}", was published.`
            )
        ).toBeVisible({timeout: 30_000});
    });

    test('S2: a declined submission cannot be published', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            decisions: ['initialDecline'],
        });

        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        await openPublicationPage(managerPage, 'Title & Abstract');
        await expectStatus(managerPage, 'Unscheduled');

        // A press opens the refused window directly (Rule 7): the
        // requirements list with the declined line, and no confirm button
        // at all (S1 asserts the button's presence on a publishable
        // monograph — the positive control taken the same way).
        const modal = await openPublishModal(managerPage);
        await expect(
            modal.getByText(
                'The following requirements must be met before this can be published.'
            )
        ).toBeVisible();
        await expect(
            modal.getByText('A declined submission can not be published.')
        ).toBeVisible();
        await expect(
            modal.getByRole('button', {name: 'Publish', exact: true})
        ).toHaveCount(0);

        // Close; the status is unchanged.
        await managerPage.keyboard.press('Escape');
        await expect(modal).toHaveCount(0, {timeout: 30_000});
        await expectStatus(managerPage, 'Unscheduled');
    });

    test('S3: unpublish takes the book down and clears the author notice', async ({asUser, ompApi, page}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s3', testInfo);
        await ompApi.createContext({tag, users: scratchUsers(tag)});
        const {submissionId} = await ompApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            published: true,
        });

        // Positive controls: the author's task notice exists and the
        // catalog page is live before the unpublish.
        const authorPage = await (await asUser(`${tag}au`)).newPage();
        const tasksBefore = await openTasks(authorPage, tag, {author: true});
        await expect(
            tasksBefore.getByText(
                `A new version of your submission, "Submission ${tag}", was published.`
            )
        ).toBeVisible({timeout: 30_000});
        await page.goto(bookUrl(tag, submissionId));
        await expect(page.getByText(`Submission ${tag}`).first()).toBeVisible({
            timeout: 30_000,
        });

        // Unpublish: red dialog wording per Rule 9, status back to
        // Unscheduled.
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await openWorkflow(managerPage, tag, submissionId);
        await openPublicationPage(managerPage, 'Title & Abstract');
        await expectStatus(managerPage, 'Published');
        await unpublishFromWorkflow(managerPage);
        await expectStatus(managerPage, 'Unscheduled');

        // The reader page is gone.
        const response = await page.goto(bookUrl(tag, submissionId));
        expect(response.status()).toBe(404);

        // Activity log: "The submission was unpublished."
        await expectLogLine(managerPage, 'The submission was unpublished.');

        // The author's task notice is gone too: their Tasks read "No Items".
        const tasksAfter = await openTasks(authorPage, tag, {author: true});
        await expect(tasksAfter.getByText('No Items')).toBeVisible({
            timeout: 30_000,
        });
    });

    test('S4: create a new version — copy, notices, readers keep the old one', async ({asUser, ompApi, page, pkpMail}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        await ompApi.createContext({
            tag,
            users: scratchUsers(tag, [
                {
                    username: `${tag}ed`,
                    givenName: 'Elena',
                    familyName: 'Editor',
                    email: `${tag}ed@mail.test`,
                    roles: ['editor'],
                },
                {
                    username: `${tag}rv`,
                    givenName: 'Rex',
                    familyName: 'Reviewer',
                    email: `${tag}rv@mail.test`,
                    roles: ['externalReviewer'],
                },
            ]),
        });
        const {submissionId} = await ompApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
            decisions: ['skipInternalReview'],
            reviewRounds: [
                {
                    stage: 'external',
                    reviewers: [{username: `${tag}rv`, status: 'accepted'}],
                },
            ],
            participants: [{username: `${tag}ed`, role: 'editor'}],
            published: true,
        });

        // The dialog arrives pre-answered (Rule 11): copy-from select over
        // the existing versions, the published version's stage and "Minor
        // Revision" preselected.
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await openWorkflow(managerPage, tag, submissionId);
        const dialog = await openCreateVersionDialog(managerPage);
        await expect(
            dialog.getByText('Which version should metadata be copied from?')
        ).toBeVisible();
        await expect(
            dialog
                .getByLabel('Which version should metadata be copied from?')
                .locator('option', {hasText: 'Version of Record 1.0'})
        ).toHaveCount(1);
        await expect(dialog.getByLabel('Publication Stage')).toHaveValue('VoR');
        await expect(dialog.getByLabel('Revision Significance')).toHaveValue('true');

        // An untouched Confirm yields "Version of Record 1.1", opening with
        // "Status: Unpublished" and the copied content.
        await confirmCreateVersion(managerPage, dialog);
        await expect(
            managerPage.getByRole('link', {name: 'Version of Record 1.1', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(
            managerPage.getByRole('heading', {name: 'Publication: Title & Abstract'})
        ).toBeVisible({timeout: 30_000});
        await expectStatus(managerPage, 'Unpublished');
        await expect(richBody(managerPage, /^Title\b/)).toContainText(
            `Submission ${tag}`
        );

        // Give the draft a distinguishable abstract so the reader-side
        // check below is positive, not date-based (A6 stays unasserted).
        const abstractBody = richBody(managerPage, /^Abstract/);
        await abstractBody.click();
        await abstractBody.fill(`V2 abstract ${tag}`);
        await abstractBody.blur();
        await savePublicationForm(managerPage);

        // Readers still get the OLD version: the catalog page's "Versions"
        // list holds only the published entry and the draft's abstract is
        // nowhere on it.
        await page.goto(bookUrl(tag, submissionId));
        await expect(page.getByText(`Submission ${tag}`).first()).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.locator('.versions li')).toHaveCount(1);
        await expect(page.locator('.versions')).toContainText('Version of Record 1.0');
        await expect(page.getByText(`V2 abstract ${tag}`)).toHaveCount(0);

        // The participating editor gets the email and the task notice; the
        // assigned reviewer gets neither (the editor's receipt is the
        // positive control; the submitting author's copy is parked on A1).
        await pkpMail.find({
            to: `${tag}ed@mail.test`,
            subject: 'A new version was created',
            contains: tag,
        });
        await pkpMail.expectNone({
            to: `${tag}rv@mail.test`,
            contains: tag,
            afterControl: {to: `${tag}ed@mail.test`, contains: tag},
        });
        const editorPage = await (await asUser(`${tag}ed`)).newPage();
        const tasks = await openTasks(editorPage, tag);
        await expect(
            tasks.getByText('A new version of a submission was created').first()
        ).toBeVisible({timeout: 30_000});
    });

    test('S5: publish the new version', async ({asUser, ompApi, page}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s5', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            published: true,
        });

        // Create the new version and give it a distinguishable abstract.
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        const dialog = await openCreateVersionDialog(managerPage);
        const newPubId = await confirmCreateVersion(managerPage, dialog);
        await expect(
            managerPage.getByRole('heading', {name: 'Publication: Title & Abstract'})
        ).toBeVisible({timeout: 30_000});
        await expectStatus(managerPage, 'Unpublished');
        const abstractBody = richBody(managerPage, /^Abstract/);
        await abstractBody.click();
        await abstractBody.fill(`V2 abstract ${tag}`);
        await abstractBody.blur();
        await savePublicationForm(managerPage);

        // Fill an Update Type ("Correction") and a Summary of Changes on
        // the new version's Catalog Entry page (their press home — Rule
        // 13/14 surface; the notice's rendering is A5's and not asserted).
        await openWorkflow(managerPage, PK, submissionId, {
            menuKey: `publication_${newPubId}_catalogEntry`,
        });
        await expect(
            managerPage.getByRole('heading', {name: 'Publication: Catalog Entry'})
        ).toBeVisible({timeout: 30_000});
        await field(managerPage, /^Update Type/)
            .locator('select')
            .first()
            .selectOption({label: 'Correction'});
        const summaryBody = richBody(managerPage, /^Summary of Changes/);
        await summaryBody.click();
        await summaryBody.fill(`Correction notice ${tag}`);
        await summaryBody.blur();
        await savePublicationForm(managerPage);

        // Publish the new version: the window names "Version of Record
        // 1.1"; confirm.
        const modal = await openPublishModal(managerPage);
        await expect(modal.getByText('Version of Record 1.1').first()).toBeVisible();
        await confirmPublish(managerPage, modal);
        await expectStatus(managerPage, 'Published');

        // The reader page now serves the new version and its "Versions"
        // list gains the new entry.
        await page.goto(bookUrl(PK, submissionId));
        await expect(page.getByText(`V2 abstract ${tag}`).first()).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.locator('.versions li')).toHaveCount(2);
        await expect(page.locator('.versions')).toContainText('Version of Record 1.1');

        // Activity log: "A new version was published."
        await openWorkflow(managerPage, PK, submissionId);
        await expectLogLine(managerPage, 'A new version was published.');
    });

    test('S6: minor and major numbering', async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s6', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            published: true,
        });

        // Same stage as an existing version: "Minor Revision" is selectable
        // and an untouched Confirm yields "… 1.1".
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        let dialog = await openCreateVersionDialog(managerPage);
        await expect(dialog.getByLabel('Publication Stage')).toHaveValue('VoR');
        await expect(
            dialog
                .getByLabel('Revision Significance')
                .locator('option', {hasText: 'Minor Revision'})
        ).toBeEnabled();
        await confirmCreateVersion(managerPage, dialog);
        await expect(
            managerPage.getByRole('link', {name: 'Version of Record 1.1', exact: true})
        ).toBeVisible({timeout: 30_000});

        // A stage with no versions yet: "Minor Revision" is greyed and the
        // result is that stage's "1.0".
        dialog = await openCreateVersionDialog(managerPage);
        await dialog
            .getByLabel('Publication Stage')
            .selectOption({label: 'Author Original (AO)'});
        await expect(
            dialog
                .getByLabel('Revision Significance')
                .locator('option', {hasText: 'Minor Revision'})
        ).toBeDisabled();
        await confirmCreateVersion(managerPage, dialog);
        await expect(
            managerPage.getByRole('link', {name: 'Author Original 1.0', exact: true})
        ).toBeVisible({timeout: 30_000});
    });

    test('S7: the version list and the author\'s view', async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s7', testInfo);
        const {submissionId, publicationId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            published: true,
        });

        // The manager prepares a second, unpublished version (and their own
        // view is the positive control for the controls the author must
        // not see).
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        const dialog = await openCreateVersionDialog(managerPage);
        const newPubId = await confirmCreateVersion(managerPage, dialog);
        await expect(
            managerPage.getByRole('link', {name: 'Version of Record 1.1', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(
            managerPage.getByRole('link', {name: 'Create New Version', exact: true})
        ).toBeVisible();

        // The author's tracking view lists every version by name; each page
        // heads with the status readout; no publish, unpublish or
        // Create-New-Version control appears anywhere.
        const authorPage = await (await asUser('author.alex')).newPage();
        await openWorkflow(authorPage, PK, submissionId, {
            author: true,
            menuKey: `publication_${publicationId}_titleAbstract`,
        });
        await expect(
            authorPage.getByRole('link', {name: 'Version of Record 1.0', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(
            authorPage.getByRole('link', {name: 'Version of Record 1.1', exact: true})
        ).toBeVisible();
        await expectStatus(authorPage, 'Published');

        await openWorkflow(authorPage, PK, submissionId, {
            author: true,
            menuKey: `publication_${newPubId}_titleAbstract`,
        });
        await expectStatus(authorPage, 'Unpublished');

        await expect(
            authorPage.getByRole('button', {name: 'Publish', exact: true})
        ).toHaveCount(0);
        await expect(
            authorPage.getByRole('button', {name: 'Unpublish', exact: true})
        ).toHaveCount(0);
        await expect(
            authorPage.getByRole('link', {name: 'Create New Version', exact: true})
        ).toHaveCount(0);
    });

    test('S8: roles without the controls', async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s8', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            participants: [
                {username: 'sectioneditor.ana', role: 'sectionEditor'},
                {username: 'layouteditor.leo', role: 'layoutEditor'},
            ],
        });

        // Positive control: the press manager sees the publish button and
        // the Create New Version item on the same monograph.
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        await openPublicationPage(managerPage, 'Title & Abstract');
        await expect(
            managerPage.getByRole('button', {name: 'Publish', exact: true})
        ).toBeVisible();
        await expect(
            managerPage.getByRole('link', {name: 'Create New Version', exact: true})
        ).toBeVisible();

        // The assigned Series Editor and the assigned Layout Editor
        // (assistant) get the version pages and the readout, but none of
        // the controls (A2's on-screen contract). The Production stage view
        // still shows each of them a "Schedule For Publication" button
        // (inherited from the OJS editorial config via the OMP deep-merge)
        // — pressing it only lands on the Publication area, where nothing
        // more is offered.
        for (const username of ['sectioneditor.ana', 'layouteditor.leo']) {
            const rolePage = await (await asUser(username)).newPage();
            await openWorkflow(rolePage, PK, submissionId);
            await rolePage.getByRole('link', {name: 'Production', exact: true}).click();
            const shortcut = rolePage
                .locator('[data-cy="workflow-action-items"]')
                .getByRole('button', {name: 'Schedule For Publication', exact: true});
            await expect(shortcut).toBeVisible({timeout: 30_000});
            await shortcut.click();
            await expect(
                rolePage.getByRole('heading', {name: 'Publication: Title & Abstract'})
            ).toBeVisible({timeout: 30_000});
            await expectStatus(rolePage, 'Unscheduled');
            await expect(
                rolePage.getByRole('button', {name: 'Publish', exact: true})
            ).toHaveCount(0);
            await expect(
                rolePage.getByRole('button', {name: 'Unpublish', exact: true})
            ).toHaveCount(0);
            await expect(
                rolePage.getByRole('link', {name: 'Create New Version', exact: true})
            ).toHaveCount(0);
        }
    });

    test('S9: unschedule a future-dated book', async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s9', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
        });

        // Reach the scheduled state via the date route (scenario 14's
        // seeding): a future Date Published, then Publish. The window's
        // wording is OMP1's and is not asserted.
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        await saveDatePublished(managerPage, '2030-06-01');
        const modal = await openPublishModal(managerPage);
        await confirmPublish(managerPage, modal, {expectButton: 'Unschedule'});
        await expectStatus(managerPage, 'Scheduled');

        // The button offered is "Unschedule"; its dialog wording per Rule
        // 9; confirming returns the version to "Status: Unscheduled".
        await managerPage
            .getByRole('button', {name: 'Unschedule', exact: true})
            .click();
        const dialog = managerPage.getByRole('dialog', {name: 'Unschedule'});
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(
            dialog.getByText(
                "Are you sure you don't want this scheduled for publication?"
            )
        ).toBeVisible();
        const unscheduled = managerPage.waitForResponse(
            (r) => r.url().includes('/unpublish') && r.ok(),
            {timeout: 30_000}
        );
        await dialog.getByRole('button', {name: 'Unschedule', exact: true}).click();
        await unscheduled;
        await expect(
            managerPage.getByRole('button', {name: 'Publish', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expectStatus(managerPage, 'Unscheduled');
    });

    test('S10: republish with what was kept', async ({asUser, ompApi, page}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s10', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
        });

        // A filled (past) date is kept on publish (Rule 8).
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        await saveDatePublished(managerPage, '2020-01-02');
        await publishFromWorkflow(managerPage);
        await expectStatus(managerPage, 'Published');

        // Unpublish keeps the date (Rule 9).
        await unpublishFromWorkflow(managerPage);
        await expectStatus(managerPage, 'Unscheduled');
        await openPublicationPage(managerPage, 'Catalog Entry');
        await expect(
            field(managerPage, /^Date Published/).locator('input').first()
        ).toHaveValue('2020-01-02');

        // Republishing goes straight back to "Published" carrying the
        // ORIGINAL date (Rule 10).
        await publishFromWorkflow(managerPage);
        await expectStatus(managerPage, 'Published');
        await openPublicationPage(managerPage, 'Catalog Entry');
        await expect(
            field(managerPage, /^Date Published/).locator('input').first()
        ).toHaveValue('2020-01-02');

        // The catalog page is live again.
        await page.goto(bookUrl(PK, submissionId));
        await expect(page.getByText(`Submission ${tag}`).first()).toBeVisible({
            timeout: 30_000,
        });
    });

    test('S14: a future date schedules the book', async ({asUser, ompApi, page}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s14', testInfo);
        const [{submissionId}, control] = await Promise.all([
            ompApi.createSubmission({
                tag,
                context: PK,
                submitter: 'author.alex',
                title: `Submission ${tag}`,
                decisions: ['skipExternalReview', 'sendToProduction'],
            }),
            ompApi.createSubmission({
                tag: `${tag}c`,
                context: PK,
                submitter: 'author.alex',
                title: `Submission ${tag}c`,
                decisions: ['skipExternalReview', 'sendToProduction'],
                published: true,
            }),
        ]);

        // Save a future Date Published on the Catalog Entry page, then
        // Publish (the window's promise-vs-outcome wording is OMP1's and is
        // not asserted). Confirming yields "Status: Scheduled".
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        await saveDatePublished(managerPage, '2030-03-01');
        const modal = await openPublishModal(managerPage);
        await confirmPublish(managerPage, modal, {expectButton: 'Unschedule'});
        await expectStatus(managerPage, 'Scheduled');

        // The offered controls become "Preview" and "Unschedule"; the
        // publish button is gone. (Scoped to the Publication area's right
        // controls — the workflow header carries its own Preview.)
        const controls = managerPage.locator('[data-cy="workflow-controls-right"]');
        await expect(
            controls.getByRole('button', {name: 'Preview', exact: true})
        ).toBeVisible();
        await expect(
            controls.getByRole('button', {name: 'Unschedule', exact: true})
        ).toBeVisible();
        await expect(
            controls.getByRole('button', {name: 'Publish', exact: true})
        ).toHaveCount(0);

        // The catalog page stays down (the same-run published control's
        // page is the positive control for the anonymous read).
        await page.goto(bookUrl(PK, control.submissionId));
        await expect(page.getByText(`Submission ${tag}c`).first()).toBeVisible({
            timeout: 30_000,
        });
        const response = await page.goto(bookUrl(PK, submissionId));
        expect(response.status()).toBe(404);
    });
});
