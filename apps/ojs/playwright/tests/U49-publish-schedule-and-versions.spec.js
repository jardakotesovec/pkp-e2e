// @ts-check
/**
 * @file playwright/tests/U49-publish-schedule-and-versions.spec.js
 *
 * Publish, schedule & versions — OJS suite, one test per canonical
 * scenario the app runs: the common scenarios 1–10 and the journal-only
 * scenarios 11–13. Spec: docs/specs/U49-publish-schedule-and-versions.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings
 * register; a claim parked on an open ❓ is not a coverage gap):
 * - A1 ❓: S4 asserts the participating editor's "A new version was
 *   created…" email and task notice, with the assigned reviewer's silence
 *   bounded by the editor's receipt — whether the submitting author should
 *   also receive it is A1's question, so the author's copy is not
 *   asserted either way.
 * - A2 ❓: S8 asserts what the screens offer (no publish controls for a
 *   Section Editor or Assistant, the stage view's navigation-only
 *   shortcut); the server-side roster half of A2 is a code observation the
 *   screens never surface, so it is not probed.
 * - A3 ❓: no test publishes a non-final-stage version and asserts the
 *   dashboards' rollup; every published version here is a Version of
 *   Record.
 * - A4 ❓: S6 asserts "Minor Revision" greyed for a stage with no
 *   versions; the silent re-select when switching TOWARD a stage with an
 *   existing version (the finding) is not asserted.
 * - A5 🐞: S5 saves an Update Type and Summary of Changes and publishes;
 *   whether the amendment notice reaches any reader page is left to the
 *   register — the suite asserts its rendering neither way.
 * - A6 🐞: S4 asserts the reader page stays live on the old version (and
 *   its Versions list unchanged) but never the date line the finding says
 *   is rewritten.
 * - OJS1 🐞: no test enables the "require a plain language summary"
 *   setting — under it the panel's Confirm dies silently.
 * - OJS2 🐞: the first-pick misfire ("Schedule Only" as the first
 *   assignment pick on a journal with no published issues is saved with
 *   the default's ready-to-publish status and publishes immediately —
 *   on the Publication Settings page as well as the panel) is not
 *   asserted anywhere — that would freeze the defect as contract. S11
 *   follows the corrected scenario's Publication-Settings-first route
 *   on a journal with a published back issue (the shape the scenario
 *   holds on); no test picks "Schedule Only" as a first pick on a
 *   published-issue-less journal.
 * - Scenario 2's "the status is unchanged" is asserted per Rule 1's
 *   in-between wording: after the panel's Confirm saved onto the declined
 *   submission the readout is "Unpublished" (not Published/Scheduled, no
 *   Unpublish control) — the panel save moves it off the pristine
 *   "Unscheduled" wording by design (Rule 1's saved-but-unconfirmed
 *   state).
 * - Rule 14 (Insert Content), Rule 16 (Send to Text Editor), the Preview
 *   control (Actors d) and the Done-stage activity-log lines (side
 *   effects) are spec claims outside the canonical scenarios; the ORCID
 *   and payment publishing requirements (Rule 7) belong to their own
 *   features' suites.
 *
 * Seeding: scenario endpoints only. publicknowledge is read-only — S9
 * seeds its own submission there (scheduled into the seeded unpublished
 * issue Vol. 2 No. 1 (2015), which stays unpublished); every other test
 * runs on a scratch journal with throwaway users. Mailpit assertions are
 * scoped by unique throwaway recipients (A8); negative mail claims carry
 * a positive control (expectNone). No hard waits — flows are bounded by
 * API responses and web-first assertions; the one known timing quirk (the
 * occasionally swallowed first press of "Schedule For Publication",
 * spec fn-k) is absorbed by the POM's bounded re-press.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    createIssue,
    publishIssue,
    waitForPublicationSave,
} = require('../pages/PublicationMetadataPages.js');
const {PublishScreen, openTasks} = require('../pages/PublishSchedulePages.js');
const {
    EditorialDashboardPage,
} = require('../../../../shared/playwright/pages/EditorialDashboardPage.js');

const JOURNAL = 'publicknowledge';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u49${scenario}w${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Seed a scratch journal with a throwaway manager and author (plus any
 * extra users); returns the usernames keyed by their short role.
 */
async function seedJournal(ojsApi, tag, extraUsers = []) {
    await ojsApi.createContext({
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
            ...extraUsers,
        ],
    });
    return {manager: `${tag}mg`, author: `${tag}au`};
}

/** The anonymous reader page for an article; returns the HTTP status. */
async function readerStatus(page, contextPath, submissionId) {
    const response = await page.goto(
        `/index.php/${contextPath}/article/view/${submissionId}`
    );
    return response ? response.status() : 0;
}

test.describe('publish, schedule & versions', () => {
    test('S1: publish a submission and see it live', {tag: '@smoke'}, async ({asUser, ojsApi, page, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s1', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const authorEmail = `${tag}au@mail.test`;
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
            decisions: ['skipExternalReview', 'sendToProduction'],
        });

        const managerPage = await (await asUser(manager)).newPage();
        const pub = new PublishScreen(managerPage, tag);

        // A published back issue for the "Assign To Current/Back Issue"
        // pick (fn-s1: use a scratch back issue).
        await createIssue(managerPage, tag, {
            volume: '1',
            number: '1',
            year: '2020',
            title: 'Back issue 2020',
        });
        await publishIssue(managerPage, 'Vol. 1 No. 1 (2020)');

        // The Publication area heads "Status: Unscheduled".
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Title & Abstract');
        await pub.expectStatus('Unscheduled');

        // "Schedule For Publication" opens "Review Publishing Details":
        // fill the stage and pick the back issue.
        const panel = await pub.openPublishPanel();
        await pub.fillVersionDetails(panel);
        const backRadio = panel.getByRole('radio', {
            name: 'Assign To Current/Back Issue',
        });
        await expect(backRadio).toBeVisible({timeout: 30_000});
        await pub.awaitAssignmentPreselected(panel);
        await backRadio.check();
        await pub.selectIssueOption(panel, /Vol\. 1 No\. 1 \(2020\)/);
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();

        // The confirmation window: requirements met, the back-issue
        // sentence, and the version to be assigned.
        const confirmation = pub.confirmationDialog(
            'All publication requirements have been met.'
        );
        await expect(
            confirmation.getByText(/This will be published immediately in .*Vol\. 1 No\. 1 \(2020\)/)
        ).toBeVisible({timeout: 30_000});
        await expect(
            confirmation.getByText('Version of Record 1.0').first()
        ).toBeVisible();
        await pub.confirmPublish(confirmation, 'Publish');

        // "Status: Published", Unpublish offered, reader page live.
        await pub.expectStatus('Published');
        await expect(
            pub.rightControls().getByRole('button', {name: 'Unpublish', exact: true})
        ).toBeVisible({timeout: 30_000});
        expect(await readerStatus(page, tag, submissionId)).toBe(200);
        await expect(
            page.getByRole('heading', {name: `Submission ${tag}s`})
        ).toBeVisible({timeout: 30_000});

        // Activity log: "The submission was published."
        const log = await pub.openActivityLog();
        await expect(
            log.getByRole('row').filter({hasText: 'The submission was published.'}).first()
        ).toBeVisible({timeout: 30_000});
        await log.getByRole('button', {name: 'Close', exact: true}).first().click();

        // The submitting author gets the "Publication Published" email …
        const mail = await pkpMail.find({
            to: authorEmail,
            subject: 'Publication Published',
            contains: tag,
        });
        expect(mail.Subject).toBe('Publication Published');

        // … and the "was published" task notice.
        const authorPage = await (await asUser(author)).newPage();
        await authorPage.goto(`/index.php/${tag}/dashboard/mySubmissions`);
        const tasks = await openTasks(authorPage);
        await expect(
            tasks
                .locator('tr')
                .filter({hasText: 'was published'})
                .filter({hasText: `Submission ${tag}s`})
                .first()
        ).toBeVisible({timeout: 30_000});
    });

    test('S2: a declined submission cannot be published', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s2', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
            decisions: ['initialDecline'],
        });

        const managerPage = await (await asUser(manager)).newPage();
        const pub = new PublishScreen(managerPage, tag);
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Title & Abstract');
        await pub.expectStatus('Unscheduled');

        // The publish button still opens "Review Publishing Details" and
        // insists on the required version fields: an empty Confirm marks
        // both in place.
        const panel = await pub.openPublishPanel();
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        await expect(
            panel.getByText('This field is required.').first()
        ).toBeVisible({timeout: 30_000});

        // Filled, the Confirm continues to the refused window: the
        // requirements heading, the declined line, and no confirm button
        // at all (positive control for the button scope: the same window
        // carries its Close control, and S1's window shows "Publish").
        await pub.fillVersionDetails(panel);
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        const refusal = managerPage
            .getByRole('dialog')
            .filter({
                hasText: 'The following requirements must be met before this can be published.',
            })
            .last();
        await expect(
            refusal.getByText('A declined submission can not be published.')
        ).toBeVisible({timeout: 30_000});
        await expect(
            refusal.getByRole('button', {name: 'Publish', exact: true})
        ).toHaveCount(0);
        await expect(
            refusal.getByRole('button', {name: 'Schedule For Publication', exact: true})
        ).toHaveCount(0);
        const closeButton = refusal.getByRole('button', {name: /Cancel|Close/}).last();
        await expect(closeButton).toBeVisible();
        await closeButton.click();
        await expect(refusal).toHaveCount(0, {timeout: 30_000});

        // Not published, not scheduled: the readout shows Rule 1's
        // in-between wording (the panel's Confirm saved the stage onto the
        // declined submission — Rule 7), and no Unpublish/Unschedule is
        // offered while the publish button remains.
        await pub.expectStatus('Unpublished');
        await expect(
            pub.rightControls().getByRole('button', {name: 'Unpublish', exact: true})
        ).toHaveCount(0);
        await expect(
            pub.rightControls().getByRole('button', {name: 'Unschedule', exact: true})
        ).toHaveCount(0);

        // Pressing the button again now SKIPS the panel (Rule 3: a saved
        // stage and confirmed issue choice are in place) and opens the
        // refused window directly — proof the panel's Confirm saved onto
        // the declined submission (Rule 7).
        await pub.publishButton().click();
        const refusal2 = managerPage
            .getByRole('dialog')
            .filter({
                hasText: 'The following requirements must be met before this can be published.',
            })
            .last();
        const declinedLine2 = refusal2.getByText(
            'A declined submission can not be published.'
        );
        try {
            await expect(declinedLine2).toBeVisible({timeout: 5_000});
        } catch {
            // fn-k: the first press is occasionally swallowed.
            await pub.publishButton().click();
        }
        await expect(declinedLine2).toBeVisible({timeout: 30_000});
        await expect(
            refusal2.getByText('Review Publishing Details')
        ).toHaveCount(0);
    });

    test('S3: unpublish takes the reader page and the task notice down', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s3', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
            published: true,
        });

        // Positive controls: the reader page is live and the author's
        // Tasks carry the "was published" notice.
        expect(await readerStatus(page, tag, submissionId)).toBe(200);
        const authorPage = await (await asUser(author)).newPage();
        await authorPage.goto(`/index.php/${tag}/dashboard/mySubmissions`);
        const tasksBefore = await openTasks(authorPage);
        const publishedRow = tasksBefore
            .locator('tr')
            .filter({hasText: 'was published'})
            .filter({hasText: `Submission ${tag}s`});
        await expect(publishedRow.first()).toBeVisible({timeout: 30_000});

        // The manager unpublishes through the red dialog.
        const managerPage = await (await asUser(manager)).newPage();
        const pub = new PublishScreen(managerPage, tag);
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Title & Abstract');
        await pub.expectStatus('Published');
        await pub.unpublish();
        await pub.expectStatus('Unscheduled');

        // The reader page is gone and the log gained the line.
        expect(await readerStatus(page, tag, submissionId)).toBe(404);
        const log = await pub.openActivityLog();
        await expect(
            log
                .getByRole('row')
                .filter({hasText: 'The submission was unpublished.'})
                .first()
        ).toBeVisible({timeout: 30_000});
        await log.getByRole('button', {name: 'Close', exact: true}).first().click();

        // The author's task notice is gone too — their Tasks read
        // "No Items" (the seeded publish's notice was their only one).
        await authorPage.goto(`/index.php/${tag}/dashboard/mySubmissions`);
        const tasksAfter = await openTasks(authorPage);
        await expect(tasksAfter.getByText('No Items').first()).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            tasksAfter.locator('tr').filter({hasText: 'was published'})
        ).toHaveCount(0);
    });

    test('S4: create a new version', async ({asUser, ojsApi, page, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        const seEmail = `${tag}se@mail.test`;
        const reviewerEmail = `${tag}rv@mail.test`;
        const {manager, author} = await seedJournal(ojsApi, tag, [
            {
                username: `${tag}se`,
                givenName: 'Sena',
                familyName: 'Sectioneditor',
                email: seEmail,
                roles: ['sectionEditor'],
            },
            {
                username: `${tag}rv`,
                givenName: 'Rita',
                familyName: 'Reviewer',
                email: reviewerEmail,
                roles: ['externalReviewer'],
            },
        ]);
        // A published submission with an accepted reviewer left on it and
        // a participating Section Editor (fn-s4).
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
            decisions: ['sendExternalReview'],
            reviewRounds: [
                {reviewers: [{username: `${tag}rv`, status: 'accepted'}]},
            ],
            participants: [{username: `${tag}se`, role: 'sectionEditor'}],
            published: true,
        });

        const managerPage = await (await asUser(manager)).newPage();
        const pub = new PublishScreen(managerPage, tag);
        await pub.gotoWorkflow(submissionId);

        // The dialog arrives pre-answered: source version, the published
        // version's stage, and "Minor Revision".
        const dialog = await pub.openCreateVersionDialog();
        await expect(
            dialog.locator('select[name="versionSource"] option').filter({
                hasText: 'Version of Record 1.0',
            })
        ).toHaveCount(1);
        await expect(dialog.locator('select[name="versionStage"]')).toHaveValue('VoR');
        await expect(dialog.locator('select[name="versionIsMinor"]')).toHaveValue('true');
        await pub.confirmVersionDialog(dialog);

        // The side menu gains "Version of Record 1.1"; its pages open with
        // "Status: Unpublished" and the copied content.
        await pub.openVersionEntry('Version of Record 1.1', 'Title & Abstract');
        await pub.expectStatus('Unpublished');
        expect(await pub.richTextContent('titleAbstract-title-control-en')).toBe(
            `Submission ${tag}s`
        );

        // Readers still get the old version: the page is live and its
        // Versions list shows nothing new (one entry).
        expect(await readerStatus(page, tag, submissionId)).toBe(200);
        await expect(page.locator('.sub_item.versions li')).toHaveCount(1);

        // The participating editor gets the email and the task notice; the
        // assigned reviewer gets neither (bounded by the editor's receipt).
        const mail = await pkpMail.find({to: seEmail, contains: tag});
        expect(mail.Subject).toContain('A new version was created');
        await pkpMail.expectNone({
            to: reviewerEmail,
            contains: tag,
            afterControl: {to: seEmail, contains: tag},
        });
        const sePage = await (await asUser(`${tag}se`)).newPage();
        await sePage.goto(`/index.php/${tag}/dashboard/editorial`);
        const seTasks = await openTasks(sePage);
        await expect(
            seTasks
                .locator('tr')
                .filter({hasText: 'A new version of a submission was created'})
                .first()
        ).toBeVisible({timeout: 30_000});
    });

    test('S5: publish the new version', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s5', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
            published: true,
        });

        const managerPage = await (await asUser(manager)).newPage();
        const pub = new PublishScreen(managerPage, tag);
        await pub.gotoWorkflow(submissionId);

        // Create the new version (untouched dialog → Version of Record
        // 1.1) and give it a distinguishable abstract.
        const dialog = await pub.openCreateVersionDialog();
        await pub.confirmVersionDialog(dialog);
        await pub.openVersionEntry('Version of Record 1.1', 'Title & Abstract');
        await pub.expectStatus('Unpublished');
        await pub.setRichText(
            'titleAbstract-abstract-control-en',
            `<p>Abstract v2 ${tag}</p>`
        );
        await pub.save();

        // Publish it, filling an Update Type and a Summary of Changes in
        // the panel on the way (their reader-side rendering is A5's).
        const panel = await pub.openPublishPanel();
        await expect(panel.locator('select[name="versionStage"]')).toHaveValue('VoR');
        await panel
            .locator('select[name="updateType"]')
            .selectOption({label: 'Correction'});
        await pub.setRichText(
            'version-summaryOfChanges-control-en',
            `<p>Correction notice ${tag}</p>`
        );
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        const confirmation = pub.confirmationDialog(
            'Are you sure you want to publish this?'
        );
        await expect(
            confirmation.getByText('Version of Record 1.1').first()
        ).toBeVisible({timeout: 30_000});
        await pub.confirmPublish(confirmation, 'Publish');
        await pub.expectStatus('Published');

        // The reader page serves the new version and its Versions list
        // gains the new entry.
        expect(await readerStatus(page, tag, submissionId)).toBe(200);
        await expect(page.getByText(`Abstract v2 ${tag}`)).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.locator('.sub_item.versions li')).toHaveCount(2);
        await expect(page.locator('.sub_item.versions')).toContainText(
            '(Version of Record 1.1)'
        );

        // The log adds "A new version was published."
        const log = await pub.openActivityLog();
        await expect(
            log
                .getByRole('row')
                .filter({hasText: 'A new version was published.'})
                .first()
        ).toBeVisible({timeout: 30_000});
    });

    test('S6: minor and major numbering', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s6', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
            published: true,
        });

        const managerPage = await (await asUser(manager)).newPage();
        const pub = new PublishScreen(managerPage, tag);
        await pub.gotoWorkflow(submissionId);

        // Same stage as the existing version: "Minor Revision" selectable
        // (and preselected) → "Version of Record 1.1".
        const first = await pub.openCreateVersionDialog();
        await expect(first.locator('select[name="versionStage"]')).toHaveValue('VoR');
        await expect(
            first.locator('select[name="versionIsMinor"] option[value="true"]')
        ).toBeEnabled();
        await expect(first.locator('select[name="versionIsMinor"]')).toHaveValue('true');
        await pub.confirmVersionDialog(first);
        await expect(pub.versionMenuItem('Version of Record 1.1')).toBeVisible({
            timeout: 30_000,
        });

        // A stage with no versions: "Minor Revision" greyed, the value
        // forced to Major, and the result is that stage's "1.0". (The
        // silent re-select on the way back is A4's — not asserted.)
        const second = await pub.openCreateVersionDialog();
        await second.locator('select[name="versionStage"]').selectOption('AO');
        await expect(
            second.locator('select[name="versionIsMinor"] option[value="true"]')
        ).toBeDisabled();
        await expect(second.locator('select[name="versionIsMinor"]')).toHaveValue('false');
        await pub.confirmVersionDialog(second);
        await expect(pub.versionMenuItem('Author Original 1.0')).toBeVisible({
            timeout: 30_000,
        });
    });

    test('S7: the version list and the author\'s view', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s7', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
            published: true,
        });

        // Two versions: the published 1.0 and an unpublished 1.1.
        const managerPage = await (await asUser(manager)).newPage();
        const managerPub = new PublishScreen(managerPage, tag);
        await managerPub.gotoWorkflow(submissionId);
        const dialog = await managerPub.openCreateVersionDialog();
        await managerPub.confirmVersionDialog(dialog);
        await expect(
            managerPub.versionMenuItem('Version of Record 1.1')
        ).toBeVisible({timeout: 30_000});

        // The author's tracking view lists every version by name; each
        // page heads with the status readout.
        const authorPage = await (await asUser(author)).newPage();
        const authorPub = new PublishScreen(authorPage, tag);
        await authorPub.gotoWorkflow(submissionId, {author: true});
        await expect(
            authorPub.versionMenuItem('Version of Record 1.0')
        ).toBeVisible({timeout: 30_000});
        await expect(
            authorPub.versionMenuItem('Version of Record 1.1')
        ).toBeVisible();
        await authorPub.openVersionEntry('Version of Record 1.1', 'Title & Abstract');
        await authorPub.expectStatus('Unpublished');
        await authorPub.openVersionEntry('Version of Record 1.0', 'Title & Abstract');
        await authorPub.expectStatus('Published');

        // No publish, unpublish or Create-New-Version control anywhere in
        // the author's view (positive control below: the manager's view of
        // the same submission offers Unpublish and Create New Version).
        await expect(
            authorPage.getByRole('button', {name: 'Unpublish', exact: true})
        ).toHaveCount(0);
        await expect(
            authorPage.getByRole('button', {name: 'Publish', exact: true})
        ).toHaveCount(0);
        await expect(
            authorPage.getByRole('button', {name: 'Schedule For Publication', exact: true})
        ).toHaveCount(0);
        await expect(
            authorPage.getByRole('link', {name: 'Create New Version', exact: true})
        ).toHaveCount(0);

        await managerPub.openVersionEntry('Version of Record 1.0', 'Title & Abstract');
        await expect(
            managerPub.rightControls().getByRole('button', {name: 'Unpublish', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(
            managerPage.getByRole('link', {name: 'Create New Version', exact: true})
        ).toBeVisible();
    });

    test('S8: roles without the controls', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s8', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag, [
            {
                username: `${tag}se`,
                givenName: 'Sena',
                familyName: 'Sectioneditor',
                email: `${tag}se@mail.test`,
                roles: ['sectionEditor'],
            },
            {
                username: `${tag}le`,
                givenName: 'Lena',
                familyName: 'Layouteditor',
                email: `${tag}le@mail.test`,
                roles: ['layoutEditor'],
            },
        ]);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            participants: [
                {username: `${tag}se`, role: 'sectionEditor'},
                {username: `${tag}le`, role: 'layoutEditor'},
            ],
        });

        // An assigned Section Editor and an assigned Assistant: the
        // Publication pages render (status readout as positive control)
        // but carry no publish controls; the Production stage view still
        // shows them a "Schedule For Publication" button that only lands
        // back on the Publication area.
        for (const username of [`${tag}se`, `${tag}le`]) {
            const rolePage = await (await asUser(username)).newPage();
            const rolePub = new PublishScreen(rolePage, tag);
            await rolePub.gotoWorkflow(submissionId);
            await expect(
                rolePage.getByRole('heading', {name: 'Workflow: Production'})
            ).toBeVisible({timeout: 30_000});
            const shortcut = rolePage
                .locator('[data-cy="workflow-action-items"]')
                .getByRole('button', {name: 'Schedule For Publication', exact: true});
            await expect(shortcut).toBeVisible({timeout: 30_000});
            await shortcut.click();
            await expect(
                rolePage.getByRole('heading', {name: 'Publication: Title & Abstract'})
            ).toBeVisible({timeout: 30_000});
            // Landed on the Publication area: no panel opened …
            await expect(rolePage.getByText('Review Publishing Details')).toHaveCount(0);
            // … the readout is there, the controls are not.
            await rolePub.expectStatus('Unscheduled');
            await expect(rolePub.rightControls()).toHaveCount(0);
            await expect(
                rolePage.getByRole('link', {name: 'Create New Version', exact: true})
            ).toHaveCount(0);
        }

        // Positive control: the manager's same Publication page offers the
        // publish button and the Create New Version item.
        const managerPage = await (await asUser(manager)).newPage();
        const managerPub = new PublishScreen(managerPage, tag);
        await managerPub.gotoWorkflow(submissionId);
        await managerPub.openEntry('Title & Abstract');
        await expect(managerPub.publishButton()).toBeVisible({timeout: 30_000});
        await expect(
            managerPage.getByRole('link', {name: 'Create New Version', exact: true})
        ).toBeVisible();
    });

    test('S9: unschedule a scheduled version', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s9', testInfo);
        // Scheduled state seeded on publicknowledge: publishing into the
        // seeded, still-unpublished issue lands as "Scheduled" (the issue
        // itself stays untouched).
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            published: true,
            issue: {volume: 2, number: 1, year: 2015},
        });

        const managerPage = await (await asUser('manager.maya')).newPage();
        const pub = new PublishScreen(managerPage, JOURNAL);
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Title & Abstract');
        await pub.expectStatus('Scheduled');

        // The button offered is "Unschedule" (no publish button on a
        // scheduled version); its red dialog asks the scheduled wording.
        await expect(
            pub.rightControls().getByRole('button', {name: 'Unschedule', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(pub.publishButton()).toHaveCount(0);
        await pub.unschedule();
        await pub.expectStatus('Unscheduled');
    });

    test('S10: republish with what was kept', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s10', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
        });

        const managerPage = await (await asUser(manager)).newPage();
        const pub = new PublishScreen(managerPage, tag);
        await createIssue(managerPage, tag, {
            volume: '9',
            number: '9',
            year: '2099',
            title: 'Future issue 2099',
        });

        // Publish as continuous publication into the future issue. (With
        // only a future issue and nothing saved, no assignment arrives
        // preselected — the panel open is bounded by its status fetch.)
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Title & Abstract');
        const panel = await pub.openPublishPanelExpectingIssueFields();
        await pub.fillVersionDetails(panel);
        const continuous = panel.getByRole('radio', {
            name: 'Assign To Future Issue and Publish Immediately',
        });
        await expect(continuous).toBeVisible({timeout: 30_000});
        await continuous.check();
        await pub.selectIssueOption(panel, /Vol\. 9 No\. 9 \(2099\)/);
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        const confirmation = pub.confirmationDialog(
            'published immediately as continuous publication'
        );
        await pub.confirmPublish(confirmation, 'Publish');
        await pub.expectStatus('Published');
        expect(await readerStatus(page, tag, submissionId)).toBe(200);

        // Unpublish while the issue is still unpublished.
        await pub.unpublish();
        await pub.expectStatus('Unscheduled');
        expect(await readerStatus(page, tag, submissionId)).toBe(404);

        // Reopening the flow: the kept issue choice arrives pre-checked
        // and decides again — straight back to "Published" through the
        // same continuous-publication window.
        const panel2 = await pub.openPublishPanelExpectingIssueFields();
        await expect(
            panel2.getByRole('radio', {
                name: 'Assign To Future Issue and Publish Immediately',
            })
        ).toBeChecked({timeout: 30_000});
        await expect(
            panel2.locator('select[name="issueId"] option:checked')
        ).toHaveText(/Vol\. 9 No\. 9 \(2099\)/);
        await panel2.getByRole('button', {name: 'Confirm', exact: true}).click();
        const confirmation2 = pub.confirmationDialog(
            'published immediately as continuous publication'
        );
        await pub.confirmPublish(confirmation2, 'Publish');
        await pub.expectStatus('Published');
        expect(await readerStatus(page, tag, submissionId)).toBe(200);
    });

    test('S11: schedule into a future issue', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s11', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
        });

        const managerPage = await (await asUser(manager)).newPage();
        const pub = new PublishScreen(managerPage, tag);
        // A published back issue alongside the future issue: on a journal
        // with no published issues the Publication Settings page's FIRST
        // assignment pick falls into OJS2's trap too (probed 2026-08-29:
        // the saved "Schedule Only" comes back as "Publish Immediately"),
        // so this test runs on the journal shape the corrected scenario
        // holds on and leaves the 🐞 unasserted.
        await createIssue(managerPage, tag, {
            volume: '1',
            number: '1',
            year: '2020',
            title: 'Back issue 2020',
        });
        await publishIssue(managerPage, 'Vol. 1 No. 1 (2020)');
        await createIssue(managerPage, tag, {
            volume: '9',
            number: '9',
            year: '2099',
            title: 'Future issue 2099',
        });

        // Choose "Assign To Future Issue and Schedule Only" plus the
        // issue on the Publication Settings page and save (the corrected
        // scenario's route).
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Publication Settings');
        const scheduleOnlyOnPage = managerPage.getByRole('radio', {
            name: 'Assign To Future Issue and Schedule Only',
        });
        await expect(scheduleOnlyOnPage).toBeVisible({timeout: 30_000});
        await scheduleOnlyOnPage.check();
        await pub.selectIssueOption(managerPage, /Vol\. 9 No\. 9 \(2099\)/);
        const saved = waitForPublicationSave(managerPage);
        await pub.saveButton().click();
        await saved;

        // "Schedule For Publication": the panel opens (no Publication
        // Stage saved yet) with the saved choice pre-checked and its
        // issue pre-picked; fill the remaining required fields and
        // Confirm. The workflow is reloaded first: opening the panel
        // straight after the save races the store's async publication
        // refresh (app-changes row 9 family) and the panel's issue select
        // then never receives the saved issue. The issue assertion also
        // bounds the panel's async issue-options load — an earlier
        // Confirm is refused client-side while the select is still empty.
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Title & Abstract');
        const panel = await pub.openPublishPanelExpectingIssueFields();
        await expect(
            panel.getByRole('radio', {
                name: 'Assign To Future Issue and Schedule Only',
            })
        ).toBeChecked({timeout: 30_000});
        await expect(
            panel.locator('select[name="issueId"] option:checked')
        ).toHaveText(/Vol\. 9 No\. 9 \(2099\)/, {timeout: 30_000});
        await pub.fillVersionDetails(panel);
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();

        // The window promises publication when the issue is published and
        // its button reads "Schedule For Publication".
        const confirmation = pub.confirmationDialog('This will be published when');
        await expect(
            confirmation.getByText(/This will be published when .*Vol\. 9 No\. 9 \(2099\)/)
        ).toBeVisible({timeout: 30_000});
        await pub.confirmPublish(confirmation, 'Schedule For Publication');

        // "Status: Scheduled", the reader page stays down, and the
        // dashboard lists it under "Scheduled for publication".
        await pub.expectStatus('Scheduled');
        await expect(
            pub.rightControls().getByRole('button', {name: 'Unschedule', exact: true})
        ).toBeVisible({timeout: 30_000});
        expect(await readerStatus(page, tag, submissionId)).toBe(404);

        const dash = new EditorialDashboardPage(managerPage, tag);
        await dash.goto();
        await dash.openView('Scheduled for publication');
        const row = await dash.findRowByTag(`${tag}s`);
        await expect(row).toContainText(`Submission ${tag}s`);
    });

    test('S12: continuous publication warns and publishes; publishing the issue releases the scheduled article', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s12', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const [continuousSub, scheduledSub] = await Promise.all([
            ojsApi.createSubmission({
                tag: `${tag}a`,
                context: tag,
                submitter: author,
                title: `Submission ${tag}a`,
            }),
            ojsApi.createSubmission({
                tag: `${tag}b`,
                context: tag,
                submitter: author,
                title: `Submission ${tag}b`,
            }),
        ]);

        const managerPage = await (await asUser(manager)).newPage();
        const pub = new PublishScreen(managerPage, tag);
        await createIssue(managerPage, tag, {
            volume: '9',
            number: '9',
            year: '2099',
            title: 'Future issue 2099',
        });

        // Schedule one article into the future issue through the
        // Publication-Settings-first route (the panel's direct first
        // pick is OJS2's 🐞 — untested) …
        await pub.gotoWorkflow(scheduledSub.submissionId);
        await pub.scheduleToFutureIssue(/Vol\. 9 No\. 9 \(2099\)/);
        await pub.expectStatus('Scheduled');
        expect(await readerStatus(page, tag, scheduledSub.submissionId)).toBe(404);

        // … and publish the other immediately as continuous publication:
        // the window spells out that the issue is not published yet.
        await pub.gotoWorkflow(continuousSub.submissionId);
        await pub.openEntry('Title & Abstract');
        const panelA = await pub.openPublishPanelExpectingIssueFields();
        await pub.fillVersionDetails(panelA);
        const continuous = panelA.getByRole('radio', {
            name: 'Assign To Future Issue and Publish Immediately',
        });
        await expect(continuous).toBeVisible({timeout: 30_000});
        await continuous.check();
        await pub.selectIssueOption(panelA, /Vol\. 9 No\. 9 \(2099\)/);
        await panelA.getByRole('button', {name: 'Confirm', exact: true}).click();
        const confirmation = pub.confirmationDialog(
            'published immediately as continuous publication'
        );
        await expect(
            confirmation.getByText(/even though it is assigned to .*Vol\. 9 No\. 9 \(2099\).* which is not published yet/)
        ).toBeVisible({timeout: 30_000});
        await pub.confirmPublish(confirmation, 'Publish');
        await pub.expectStatus('Published');

        // Live at once, listed with its still-unpublished issue.
        expect(await readerStatus(page, tag, continuousSub.submissionId)).toBe(200);
        await expect(page.locator('.item.issue')).toContainText(
            'Vol. 9 No. 9 (2099)',
            {timeout: 30_000}
        );

        // Publishing the issue (an Issues act) releases the scheduled
        // article.
        await managerPage.goto(`/index.php/${tag}/manageIssues`);
        await publishIssue(managerPage, 'Vol. 9 No. 9 (2099)');
        await pub.gotoWorkflow(scheduledSub.submissionId);
        await pub.openEntry('Title & Abstract');
        await pub.expectStatus('Published');
        expect(await readerStatus(page, tag, scheduledSub.submissionId)).toBe(200);
    });

    test('S13: no issues, no choices', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s13', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
        });

        const managerPage = await (await asUser(manager)).newPage();
        const pub = new PublishScreen(managerPage, tag);
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Title & Abstract');

        // The panel shows no Issue Assignment at all (positive control:
        // its version fields are there; the issueless confirmation window
        // below proves the flow took the no-issue path).
        const panel = await pub.openPublishPanel();
        await pub.fillVersionDetails(panel);
        await expect(panel.locator('input[name="assignment"]')).toHaveCount(0);
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        const confirmation = pub.confirmationDialog(
            'published immediately without any issue association'
        );
        await expect(
            confirmation.getByText('All publication requirements have been met.')
        ).toBeVisible({timeout: 30_000});
        await pub.confirmPublish(confirmation, 'Publish');

        // Published immediately, issueless: live reader page with no
        // issue block.
        await pub.expectStatus('Published');
        expect(await readerStatus(page, tag, submissionId)).toBe(200);
        await expect(
            page.getByRole('heading', {name: `Submission ${tag}s`})
        ).toBeVisible({timeout: 30_000});
        await expect(page.locator('.item.issue .title')).toHaveCount(0);
    });
});
