// @ts-check
/**
 * @file playwright/tests/U40-publication-metadata.spec.js
 *
 * Publication metadata — OPS suite, one test per canonical COMMON scenario
 * as a preprint server runs it (scenarios 1–8, in OPS vocabulary: the
 * workflow's Publication area is the "Preprint" nav group, pages are headed
 * "Preprint: {entry}", publishing is "Post"/"Unpost", the reader surface is
 * the preprint's landing page, there is no issue/scheduling machinery and
 * the author has no stage screen) plus the spec's OPS-specific scenario 11
 * (the wizard-chosen license arrives on Permissions & Disclosure unlocked).
 * Spec: docs/specs/U40-publication-metadata.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - A1 🐞 (a required Plain Language Summary blocks every other save; OPS
 *   posts without a summary): the "Require" level is never set and neither
 *   side of the finding is asserted.
 * - A2 🐞 (reset stamps year 1970 on unposted items) and A3 ❓ (the reset's
 *   reach into unposted/declined submissions): S7 runs the reset on a server
 *   whose only submission is posted and asserts only that item; nothing is
 *   asserted about unposted or declined items.
 * - A4 🐞 (the author's edit permission never returns after an unpost): S3
 *   does not assert the intermediate locked state after the unpost — it goes
 *   straight to the assignment re-tick (Rule 2's contract side) and asserts
 *   that saving works from there.
 * - A13 🐞 (the reset button stays greyed after Cancel): S7 reloads the
 *   Tools page after the Cancel leg instead of pressing again in place; the
 *   greyed state is not asserted either way.
 * - A5 ❓ (scheduled items and the language change): a preprint server has
 *   no scheduling — no OPS surface.
 * - A8 ❓ (read-only fields stay typeable): locked pages are asserted via
 *   the disabled Save button only; field typeability is not asserted.
 * - A10 ❓ / dropped claim: no test asserts that a term recorded on one
 *   submission is suggested on another; keyword entry always takes the
 *   typed-term path.
 * - A11 ❓ (the automatic copyright holder carries the contributor's role):
 *   holder descriptions are matched up to the contributor's name; the
 *   role-in-parentheses suffix is never asserted, and filled holder values
 *   are only asserted where they are an override or the server's name.
 * - A12 ❓: the "Custom copyright statement" option is never exercised.
 * - A14 ❓ (the language panel's Abstract: required vs "recommended"): S6
 *   fills the Abstract box without asserting its required marker, its
 *   description, or the empty-abstract refusal.
 * - OPS2 ❓: S11 does not assert the License URL description sentence
 *   either way.
 * - Scenario 6's two-version control (readout gone once a second version
 *   exists): not driven — "Create New Version" belongs to *Publish,
 *   schedule & versions*, and the client guard is the same single condition
 *   as the posted control S6 does assert (spec f-a6).
 * - Scenario 3's journal-only scheduled leg and scenario 9 (issue-based
 *   copyright year): OJS-only, no OPS surface; scenario 10 is OMP-only.
 * - Rule 3's multi-language "{n}/{m} languages completed" counters and the
 *   word-count/abstract-policy legs of Rule 5 (section "Word Count" /
 *   "Do not require abstracts" belong to the sections feature's setup): not
 *   asserted here.
 * - Side-effect silence ("no email or notification is sent"): a silence
 *   claim with no natural in-test positive control; no Mailpit use in this
 *   suite.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only at the journal level — S1/S3/S4 mutate only their own
 * seeded submissions there; every settings mutation (S2, S5–S8, S11) runs
 * on a scratch preprint server with throwaway users. Waits are event-based
 * (publications/contexts API responses, the "Saved" form status, web-first
 * assertions) — no hard-coded sleeps. Everything runs in the parallel
 * `ops` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    PublicationScreen,
    openWorkflow,
    postPreprint,
    unpostPreprint,
    saveSettingsPanel,
} = require('../pages/PublicationPages.js');
const {EditorialDashboardPage} = require('../pages/EditorialDashboardPage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');
const {
    STEPS,
    SUBMIT_DIALOGS,
    wizardUrl,
    expectWizardOpen,
    expectStep,
    continueTo,
    addGalleyFile,
    setRelationStatus,
    openReview,
    problemsBanner,
    confirmSubmit,
} = require('../pages/SubmissionWizardPages.js');

const PK = 'publicknowledge';
const PK_PREFIX = '/en';
const CC_BY = 'https://creativecommons.org/licenses/by/4.0';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u40${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
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

/** Open Settings › Distribution › License and return its tab panel. */
async function openLicenseSettings(page, contextPath) {
    await page.goto(`/index.php/${contextPath}/management/settings/distribution`);
    await page.locator('#license-button').click();
    const panel = page.locator('#license');
    await expect(
        panel.getByRole('button', {name: 'Save', exact: true})
    ).toBeVisible({timeout: 30_000});
    return panel;
}

test.describe('Publication metadata (U40)', () => {
    test('S1: edit the title and abstract', {tag: '@smoke'}, async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const title = `Submission ${tag}`;
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title,
        });

        const page = await (await asUser('manager.maya')).newPage();
        await openWorkflow(page, PK, submissionId);
        const screen = new PublicationScreen(page);
        await screen.openPage('Title & Abstract');

        // The page carries Prefix (with its guidance), Title, Subtitle and
        // Abstract, filled with what the author entered (Fields & validation).
        await expect(page.getByText('Examples: A, The')).toBeVisible();
        await expect(screen.richTextBody('titleAbstract', 'title', 'en')).toContainText(
            title
        );
        await expect(screen.input('titleAbstract', 'prefix', 'en')).toBeVisible();
        await expect(
            screen.richTextBody('titleAbstract', 'subtitle', 'en')
        ).toBeVisible();

        // Clearing the Title and saving is refused in the browser: the error
        // summary with its "Go to" button, "This field is required." on the
        // field, and nothing sent (Rule 4 / Fields & validation).
        await screen.fillRichText('titleAbstract', 'title', 'en', '');
        await screen.saveButton().click();
        await expect(page.getByText('Please correct one error.')).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.getByRole('button', {name: /Go to Title/})).toBeVisible();
        await expect(page.getByText('This field is required.').first()).toBeVisible();

        // Restore the title and make it italic through the focused editor's
        // "Formatting" menu (Rule 5 / Fields & validation), add prefix,
        // subtitle and a changed abstract; Save shows "Saved" (Rule 4).
        await screen.fillRichText('titleAbstract', 'title', 'en', title);
        const titleBody = screen.richTextBody('titleAbstract', 'title', 'en');
        await titleBody.click();
        await titleBody.press('ControlOrMeta+a');
        await screen
            .fieldWrapper('titleAbstract', 'title', 'en')
            .getByRole('button', {name: 'Formatting'})
            .click();
        // The Formatting drop-down portals its Bold/Italic/… buttons into
        // TinyMCE's floating container at the document root (live-probed;
        // the in-form Abstract toolbar has its own Italic, so scope to the
        // portal).
        await page
            .locator('.tox-tinymce-aux')
            .getByRole('button', {name: 'Italic', exact: true})
            .last()
            .click();
        await screen.input('titleAbstract', 'prefix', 'en').fill('The');
        await screen.fillRichText('titleAbstract', 'subtitle', 'en', `Subtitle ${tag}`);
        await screen.fillRichText(
            'titleAbstract',
            'abstract',
            'en',
            `Edited abstract ${tag}.`
        );
        await screen.save();

        // Reload: prefix, subtitle, italic title and abstract are as saved.
        await openWorkflow(page, PK, submissionId);
        await screen.openPage('Title & Abstract');
        await expect(screen.input('titleAbstract', 'prefix', 'en')).toHaveValue('The');
        await expect(
            screen.richTextBody('titleAbstract', 'subtitle', 'en')
        ).toContainText(`Subtitle ${tag}`);
        await expect(
            screen.richTextBody('titleAbstract', 'abstract', 'en')
        ).toContainText(`Edited abstract ${tag}.`);
        const savedTitle = await screen.readRichText('titleAbstract', 'title', 'en');
        expect(savedTitle).toContain(title);
        expect(savedTitle).toMatch(/<(i|em)[\s>]/);

        // The Activity Log gained "Submission metadata updated" (Rule 4 /
        // Side effects).
        await page.getByRole('button', {name: 'Activity Log', exact: true}).click();
        const logModal = page.locator('[data-cy="active-modal"]').last();
        await expect(logModal.getByText('Activity Log & Notes')).toBeVisible({
            timeout: 30_000,
        });
        await waitForJQueryIdle(page);
        await expect(
            logModal.getByText('Submission metadata updated').first()
        ).toBeVisible({timeout: 30_000});
        await logModal.getByRole('button', {name: 'Close'}).first().click();

        // The dashboard list's title reads with the new prefix (scenario 1:
        // the list renders the full title). The in-page search narrows the
        // CURRENT view, so open "Active submissions" explicitly first.
        const dashboard = new EditorialDashboardPage(page, PK);
        await dashboard.gotoView('active');
        const row = await dashboard.findRowByTag(tag);
        await expect(row).toContainText(`The Submission ${tag}`);
    });

    test('S2: the Metadata page follows the server\'s setup', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        await opsApi.createContext({tag, users: contextUsers(tag)});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
        });

        const page = await (await asUser(`${tag}mg`)).newPage();

        // Untick every "Enable … metadata" box (Rule 6).
        let panel = await openMetadataSettings(page, tag);
        const boxes = panel.getByRole('checkbox', {name: /^Enable .* metadata$/});
        await expect(boxes.first()).toBeVisible({timeout: 30_000});
        const boxCount = await boxes.count();
        for (let i = 0; i < boxCount; i++) {
            const box = boxes.nth(i);
            if (await box.isChecked()) {
                await box.uncheck();
            }
        }
        await saveSettingsPanel(page, panel);

        // The Metadata page reads its empty message, with no Save button.
        await openWorkflow(page, tag, submissionId);
        const screen = new PublicationScreen(page);
        await screen.openPage('Metadata');
        await expect(
            page.getByText('No metadata fields are currently enabled.')
        ).toBeVisible({timeout: 30_000});
        await expect(screen.saveButton()).toHaveCount(0);

        // Enable Keywords and Coverage; the page shows exactly those.
        panel = await openMetadataSettings(page, tag);
        await panel.getByRole('checkbox', {name: 'Enable keyword metadata'}).check();
        await panel.getByRole('checkbox', {name: 'Enable coverage metadata'}).check();
        await saveSettingsPanel(page, panel);

        await openWorkflow(page, tag, submissionId);
        await screen.openPage('Metadata');
        const keywordsInput = screen
            .fieldWrapper('metadata', 'keywords', 'en')
            .locator('input.pkpAutosuggest__input');
        await expect(keywordsInput).toBeVisible({timeout: 30_000});
        await expect(screen.input('metadata', 'coverage', 'en')).toBeVisible();
        await expect(page.getByText('Subjects', {exact: true})).toHaveCount(0);
        await expect(page.getByText('Rights', {exact: true})).toHaveCount(0);

        // Term list (Rule 7): Enter adds the typed term as a chip with its
        // "Remove {term}" button; the chip's button removes it; a term
        // nobody has used before is accepted as typed. (Suggestions from
        // other submissions are A10's open question — never asserted.)
        const chip = page.getByRole('button', {name: 'Remove ocean acidification'});
        await keywordsInput.click();
        await keywordsInput.pressSequentially('ocean acidification', {delay: 15});
        await keywordsInput.press('Enter');
        await expect(chip).toBeVisible({timeout: 30_000});
        await chip.click();
        await expect(chip).toHaveCount(0);
        await keywordsInput.pressSequentially('ocean acidification', {delay: 15});
        await keywordsInput.press('Enter');
        await expect(chip).toBeVisible({timeout: 30_000});
        const novelTerm = `nov${tag}`;
        await keywordsInput.pressSequentially(novelTerm, {delay: 15});
        await keywordsInput.press('Enter');
        await expect(
            page.getByRole('button', {name: `Remove ${novelTerm}`})
        ).toBeVisible({timeout: 30_000});

        await screen.input('metadata', 'coverage', 'en').fill('Pacific Ocean, 2020');
        await screen.save();

        // Reload: both chips and the coverage value are there.
        await openWorkflow(page, tag, submissionId);
        await screen.openPage('Metadata');
        await expect(chip).toBeVisible({timeout: 30_000});
        await expect(
            page.getByRole('button', {name: `Remove ${novelTerm}`})
        ).toBeVisible();
        await expect(screen.input('metadata', 'coverage', 'en')).toHaveValue(
            'Pacific Ocean, 2020'
        );

        // Disabling Coverage hides the field but keeps the stored value;
        // re-enabling shows it again (Rule 6). Keywords is the positive
        // control on the absence read.
        panel = await openMetadataSettings(page, tag);
        await panel.getByRole('checkbox', {name: 'Enable coverage metadata'}).uncheck();
        await saveSettingsPanel(page, panel);
        await openWorkflow(page, tag, submissionId);
        await screen.openPage('Metadata');
        await expect(keywordsInput).toBeVisible({timeout: 30_000});
        await expect(screen.input('metadata', 'coverage', 'en')).toHaveCount(0);

        panel = await openMetadataSettings(page, tag);
        await panel.getByRole('checkbox', {name: 'Enable coverage metadata'}).check();
        await saveSettingsPanel(page, panel);
        await openWorkflow(page, tag, submissionId);
        await screen.openPage('Metadata');
        await expect(screen.input('metadata', 'coverage', 'en')).toHaveValue(
            'Pacific Ocean, 2020',
            {timeout: 30_000}
        );
    });

    test('S3: the author before and after posting', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        // Before posting, the submitting author's own page saves like an
        // editor's (OPS1 ✅ — the preprint-server divergence the spec marks
        // on scenario 3).
        const authorPage = await (await asUser('author.alex')).newPage();
        await openWorkflow(authorPage, PK, submissionId, {author: true});
        const authorScreen = new PublicationScreen(authorPage);
        await authorScreen.openPage('Title & Abstract');
        await expect(authorScreen.saveButton()).toBeEnabled();
        await authorScreen.fillRichText(
            'titleAbstract',
            'abstract',
            'en',
            `Author abstract ${tag}.`
        );
        await authorScreen.save();

        // The OPS author view has no stage screen and no language readout
        // anywhere (Rule 1 / Rule 13a, OPS markers) — bounded by the page
        // being open; the manager's readout in S6 is the cross-check that
        // the readout renders at all.
        await expect(
            authorPage.getByRole('link', {name: 'Production', exact: true})
        ).toHaveCount(0);
        await expect(authorScreen.languageReadout()).toHaveCount(0);

        // The manager posts the preprint through the screens.
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        const managerScreen = new PublicationScreen(managerPage);
        await managerScreen.openProductionStage();
        await postPreprint(managerPage);

        // The author's page now carries the posted banner and Save is
        // unavailable (Rule 9, OPS wording).
        await openWorkflow(authorPage, PK, submissionId, {author: true});
        await authorScreen.openPage('Title & Abstract');
        await expect(
            authorPage.getByText('This version has been posted and can not be edited.')
        ).toBeVisible({timeout: 30_000});
        await expect(authorScreen.saveButton()).toBeDisabled();

        // Unpost, then re-tick "Allow this person to make changes to the
        // publication…" on the author's assignment (Rule 2's assignment
        // leg; that the re-tick is NEEDED after an unpost is A4 🐞 — the
        // intermediate locked state is deliberately not asserted). A posted
        // preprint's workflow opens on its publication screen, where the
        // "Unpost" control lives.
        await openWorkflow(managerPage, PK, submissionId);
        await unpostPreprint(managerPage);

        await openWorkflow(managerPage, PK, submissionId);
        await managerScreen.openProductionStage();
        await managerPage
            .getByRole('button', {name: 'Alex Author More Actions'})
            .click();
        await managerPage.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        // The workflow panel is itself an active-modal — scope the legacy
        // "Edit Assignment" modal by its own title text.
        const editModal = managerPage
            .locator('[data-cy="active-modal"]')
            .filter({hasText: 'Edit Assignment'});
        await expect(editModal.getByText('Edit Assignment')).toBeVisible({
            timeout: 30_000,
        });
        await waitForJQueryIdle(managerPage);
        await editModal.locator('input[name="canChangeMetadata"]').check();
        await editModal.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(editModal).toHaveCount(0, {timeout: 30_000});

        // The author's Save works again at once, and the edit persists.
        await openWorkflow(authorPage, PK, submissionId, {author: true});
        await authorScreen.openPage('Title & Abstract');
        await expect(authorScreen.saveButton()).toBeEnabled({timeout: 30_000});
        await authorScreen.fillRichText(
            'titleAbstract',
            'abstract',
            'en',
            `Restored abstract ${tag}.`
        );
        await authorScreen.save();
        await openWorkflow(authorPage, PK, submissionId, {author: true});
        await authorScreen.openPage('Title & Abstract');
        await expect(
            authorScreen.richTextBody('titleAbstract', 'abstract', 'en')
        ).toContainText(`Restored abstract ${tag}.`);
    });

    test('S4: editing a posted version reaches readers at once', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            published: true,
        });

        // Every Publication page of the posted version warns the editor
        // (Rule 8; base wording on all three apps).
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        const screen = new PublicationScreen(managerPage);
        const warning = managerPage.getByText(
            'This version has been published. Editing it may impact the published content.'
        );
        await screen.openPage('Title & Abstract');
        await expect(warning).toBeVisible({timeout: 30_000});
        await screen.openPage('Metadata');
        await expect(warning).toBeVisible({timeout: 30_000});
        await screen.openPage('Permissions & Disclosure');
        await expect(warning).toBeVisible({timeout: 30_000});

        // The form stays editable: change the abstract and save (Rule 8).
        // Content-verified edit: a late async component refresh can remount
        // the form and revert the editor to the server value after the fill
        // (payload-probed: the save then POSTs the OLD abstract — 200 +
        // toast, stale DB, the mechanism behind today's gate reds). Each
        // bounded attempt redoes fill+save and passes only when the save
        // response's publication JSON holds the new abstract.
        await screen.openPage('Title & Abstract');
        await expect(async () => {
            await screen.fillRichText(
                'titleAbstract',
                'abstract',
                'en',
                `Post-publication abstract ${tag}.`
            );
            const response = await screen.save();
            const publication = await response.json();
            expect(publication.abstract?.en ?? '').toContain(
                `Post-publication abstract ${tag}.`
            );
        }).toPass({intervals: [1_000, 2_000], timeout: 90_000});

        // The anonymous reader sees the new abstract at once on the
        // preprint's landing page. (The two gate reds here were a harness
        // bug — the editor content wasn't committed to the form model
        // before Save, so the POST persisted the OLD abstract and the
        // reader honestly rendered DB truth; fixed in fillRichText.)
        await page.goto(`/index.php/${PK}${PK_PREFIX}/preprint/view/${submissionId}`);
        await expect(
            page.getByRole('heading', {name: `Submission ${tag}`})
        ).toBeVisible({timeout: 30_000});
        await expect(
            page.getByText(`Post-publication abstract ${tag}.`)
        ).toBeVisible();
    });

    test('S5: copyright and license — defaults, override, post', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const controlTag = `${tag}c`;
        await opsApi.createContext({tag, users: contextUsers(tag)});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
        });

        const managerPage = await (await asUser(`${tag}mg`)).newPage();

        // Settings › Distribution › License: holder "Author", CC BY 4.0,
        // License Terms (Settings that modify behavior).
        const licensePanel = await openLicenseSettings(managerPage, tag);
        await licensePanel.getByRole('radio', {name: 'Author', exact: true}).check();
        await licensePanel
            .getByRole('radio', {name: 'CC Attribution 4.0', exact: true})
            .check();
        const termsBody = managerPage
            .frameLocator('iframe#license-licenseTerms-control-en_ifr')
            .locator('body');
        await termsBody.click();
        await termsBody.fill(`License terms paragraph ${tag}.`);
        await saveSettingsPanel(managerPage, licensePanel);

        // Permissions & Disclosure: the three fields arrive locked, each
        // with its automatic-value sentence and an Override link (Rule 11;
        // OPS "… posted." wording). The holder sentence is matched up to
        // the contributor's name — its exact tail is A11's open question.
        await openWorkflow(managerPage, tag, submissionId);
        const screen = new PublicationScreen(managerPage);
        await screen.openPage('Permissions & Disclosure');

        const holderInput = screen.input('publicationLicense', 'copyrightHolder', 'en');
        const yearInput = screen.input('publicationLicense', 'copyrightYear');
        const licenseInput = screen.input('publicationLicense', 'licenseUrl');
        await expect(holderInput).toBeDisabled();
        await expect(yearInput).toBeDisabled();
        await expect(licenseInput).toBeDisabled();
        await expect(
            screen.fieldWrapper('publicationLicense', 'copyrightHolder', 'en')
        ).toContainText(/Copyright will be assigned automatically to Ada Author/);
        await expect(
            screen.fieldWrapper('publicationLicense', 'copyrightYear')
        ).toContainText(
            'The copyright year will be set automatically based on the posted date.'
        );
        const licenseWrapper = screen.fieldWrapper('publicationLicense', 'licenseUrl');
        await expect(licenseWrapper).toContainText(
            'The license will be set automatically to'
        );
        await expect(licenseWrapper).toContainText('CC Attribution 4.0');
        await expect(licenseWrapper).toContainText('when this is posted.');

        // Override the Copyright Holder and save (Rule 11).
        await screen.overrideButton('publicationLicense', 'copyrightHolder', 'en').click();
        await expect(holderInput).toBeEnabled();
        await holderInput.fill('Example Society');
        await screen.save();

        // Post; posting fills the still-empty fields from the defaults and
        // never overwrites the override (Rule 12).
        await screen.openProductionStage();
        await postPreprint(managerPage);
        await openWorkflow(managerPage, tag, submissionId);
        await screen.openPage('Permissions & Disclosure');
        await expect(holderInput).toHaveValue('Example Society', {timeout: 30_000});
        await expect(yearInput).toHaveValue(String(new Date().getFullYear()));
        await expect(licenseInput).toHaveValue(CC_BY);
        await expect(holderInput).toBeEnabled();
        await expect(yearInput).toBeEnabled();
        await expect(licenseInput).toBeEnabled();

        // The reader's License block (Rule 15): copyright line with the
        // override, the Creative Commons sentence, the License Terms.
        await page.goto(`/index.php/${tag}/preprint/view/${submissionId}`);
        const block = page.locator('.item.copyright');
        await expect(block).toBeVisible({timeout: 30_000});
        await expect(block).toContainText(
            `Copyright (c) ${new Date().getFullYear()} Example Society`
        );
        await expect(block).toContainText(
            'This work is licensed under a Creative Commons Attribution 4.0 International License.'
        );
        await expect(block).toContainText(`License terms paragraph ${tag}.`);

        // Control: on a server with no default license and no terms, a
        // posted preprint's page has no License block at all — bounded by
        // the page having rendered.
        await opsApi.createContext({tag: controlTag, users: contextUsers(controlTag)});
        const control = await opsApi.createSubmission({
            tag: `${controlTag}s`,
            context: controlTag,
            submitter: `${controlTag}au`,
            title: `Submission ${controlTag}`,
            published: true,
        });
        await page.goto(
            `/index.php/${controlTag}/preprint/view/${control.submissionId}`
        );
        await expect(
            page.getByRole('heading', {name: `Submission ${controlTag}`})
        ).toBeVisible({timeout: 30_000});
        await expect(page.locator('.item.copyright')).toHaveCount(0);
    });

    test('S6: change the submission language', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        await opsApi.createContext({
            tag,
            context: {
                supportedLocales: ['en', 'fr_CA'],
                supportedSubmissionLocales: ['en', 'fr_CA'],
            },
            users: contextUsers(tag),
        });
        const [{submissionId}, posted] = await Promise.all([
            opsApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: `${tag}au`,
                title: `Submission ${tag}`,
            }),
            opsApi.createSubmission({
                tag: `${tag}p`,
                context: tag,
                submitter: `${tag}au`,
                title: `Submission ${tag}p`,
                published: true,
            }),
        ]);

        const page = await (await asUser(`${tag}mg`)).newPage();
        await openWorkflow(page, tag, submissionId);
        const screen = new PublicationScreen(page);

        // Rule 13a: a Publication page shows the readout WITH "Change";
        // the stage screen shows the readout without it.
        await screen.openPage('Title & Abstract');
        await expect(screen.languageReadout()).toContainText('English');
        await expect(screen.changeLanguageButton()).toBeVisible();
        await screen.openProductionStage();
        await expect(screen.languageReadout()).toContainText('English', {
            timeout: 30_000,
        });
        await expect(screen.changeLanguageButton()).toHaveCount(0);

        // Rule 13b/13c: the panel offers both languages; Cancel changes
        // nothing; picking French reveals the warning and the metadata
        // boxes (the Abstract box is filled WITHOUT asserting its required
        // marking — A14 stays open), and Confirm switches the language.
        await screen.openPage('Title & Abstract');
        await screen.changeLanguageButton().click();
        const panel = screen.changeLanguagePanel();
        await expect(panel.getByText('Change Submission Language For')).toBeVisible({
            timeout: 30_000,
        });
        await expect(panel.getByRole('radio', {name: 'English'})).toBeChecked();
        await expect(panel.getByRole('radio', {name: 'French (Canada)'})).toBeVisible();
        await panel.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(panel).toHaveCount(0, {timeout: 30_000});
        await expect(screen.languageReadout()).toContainText('English');

        await screen.changeLanguageButton().click();
        await expect(panel.getByText('Change Submission Language For')).toBeVisible({
            timeout: 30_000,
        });
        await panel.getByRole('radio', {name: 'French (Canada)'}).check();
        await expect(
            panel.getByText(
                'Before changing the submission language, ensure you have filled out the following metadata fields'
            )
        ).toBeVisible({timeout: 30_000});
        // The revealed boxes initialize asynchronously and may pre-fill
        // from the stored copy (observed live: typing before the editor's
        // init loses the typed value to the init's content reset, and the
        // pre-fill itself varies) — wait for each editor's own initialized
        // flag before typing, then verify the typed text stuck.
        for (const name of ['title', 'abstract']) {
            await page.waitForFunction(
                (id) =>
                    // @ts-ignore tinymce is the page's global
                    window.tinymce?.get(id)?.initialized === true,
                `changeSubmissionLanguageMetadata-${name}-control`,
                {timeout: 30_000}
            );
        }
        const frTitle = page
            .frameLocator('iframe#changeSubmissionLanguageMetadata-title-control_ifr')
            .locator('body');
        await frTitle.click();
        await frTitle.press('ControlOrMeta+a');
        await frTitle.press('Delete');
        await frTitle.fill(`Titre ${tag}`);
        const frAbstract = page
            .frameLocator('iframe#changeSubmissionLanguageMetadata-abstract-control_ifr')
            .locator('body');
        await frAbstract.click();
        await frAbstract.press('ControlOrMeta+a');
        await frAbstract.press('Delete');
        await frAbstract.fill(`Resume ${tag}.`);
        await expect(frTitle).toContainText(`Titre ${tag}`);
        const changed = page.waitForResponse(
            (r) =>
                r.url().includes('/changeLocale') &&
                ['PUT', 'POST'].includes(r.request().method()) &&
                r.ok(),
            {timeout: 30_000}
        );
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        await changed;

        // The screen reloads on Title & Abstract, open in French; the
        // readout names French; the English title is behind the language
        // bar (Rule 3 / 13c).
        await expect(screen.languageReadout()).toContainText('French (Canada)', {
            timeout: 60_000,
        });
        await expect(
            screen.richTextBody('titleAbstract', 'title', 'fr_CA')
        ).toContainText(`Titre ${tag}`, {timeout: 30_000});
        await page
            .locator('.pkpFormLocales')
            .first()
            .getByRole('button', {name: 'English', exact: true})
            .click();
        await expect(
            screen.richTextBody('titleAbstract', 'title', 'en')
        ).toContainText(`Submission ${tag}`, {timeout: 30_000});

        // The contributor's names were copied into the new language (13c).
        await screen.openPage('Contributors');
        const contributorRow = page
            .locator('.listPanel__item')
            .filter({hasText: 'Ada'})
            .first();
        await contributorRow.getByRole('button', {name: 'Edit', exact: true}).click();
        await expect(
            page.locator('#contributor-givenName-control-fr_CA')
        ).toHaveValue('Ada', {timeout: 30_000});

        // Controls (13a): the posted preprint shows neither readout nor
        // "Change" on a Publication page, while its stage screen keeps the
        // readout.
        await openWorkflow(page, tag, posted.submissionId);
        await screen.openPage('Title & Abstract');
        await expect(screen.languageReadout()).toHaveCount(0);
        await expect(screen.changeLanguageButton()).toHaveCount(0);
        await screen.openProductionStage();
        await expect(screen.languageReadout()).toContainText('English', {
            timeout: 30_000,
        });
        await expect(screen.changeLanguageButton()).toHaveCount(0);
    });

    test('S7: reset every preprint\'s permissions', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const serverName = `Scratch Server ${tag}`;
        await opsApi.createContext({
            tag,
            context: {name: {en: serverName}},
            users: contextUsers(tag),
        });
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
            published: true,
        });

        const managerPage = await (await asUser(`${tag}mg`)).newPage();

        // Give the server a default license and pin the holder to the
        // server itself, so the reset's outcome is deterministic (the
        // "Author" holder string is A11's open question).
        const licensePanel = await openLicenseSettings(managerPage, tag);
        await licensePanel.getByRole('radio', {name: 'Server', exact: true}).check();
        await licensePanel
            .getByRole('radio', {name: 'CC Attribution 4.0', exact: true})
            .check();
        await saveSettingsPanel(managerPage, licensePanel);

        // Override the posted item's Copyright Holder (scenario 5's state).
        await openWorkflow(managerPage, tag, submissionId);
        const screen = new PublicationScreen(managerPage);
        await screen.openPage('Permissions & Disclosure');
        const holderInput = screen.input('publicationLicense', 'copyrightHolder', 'en');
        // Posting filled the holder, so the field is already unlocked.
        await expect(holderInput).toBeEnabled();
        await holderInput.fill('Example Society');
        await screen.save();

        // Tools › Permissions: the button asks through the browser's own
        // confirm box; Cancel sends nothing (Rule 14). The page is reloaded
        // before the second attempt (the in-place button state after Cancel
        // is A13 — not asserted).
        await managerPage.goto(`/index.php/${tag}/management/tools`);
        await managerPage.getByRole('link', {name: 'Permissions', exact: true}).click();
        const resetButton = managerPage.getByRole('button', {
            name: 'Reset Preprint Permissions',
            exact: true,
        });
        await expect(resetButton).toBeVisible({timeout: 30_000});
        let confirmMessage = '';
        managerPage.once('dialog', (dialog) => {
            confirmMessage = dialog.message();
            void dialog.dismiss();
        });
        await resetButton.click();
        expect.soft(confirmMessage).toBe(
            'Are you sure you wish to reset permissions data for all preprints? This action can not be undone.'
        );

        // Nothing changed: the override is still there.
        await openWorkflow(managerPage, tag, submissionId);
        await screen.openPage('Permissions & Disclosure');
        await expect(holderInput).toHaveValue('Example Society', {timeout: 30_000});

        // Reload the tool, confirm with OK: the success toast appears and
        // the posted item's permissions are back to the server's defaults
        // (Rule 14; unposted/declined items are A2/A3 territory — this
        // server holds only the posted item).
        await managerPage.goto(`/index.php/${tag}/management/tools`);
        await managerPage.getByRole('link', {name: 'Permissions', exact: true}).click();
        await expect(resetButton).toBeVisible({timeout: 30_000});
        managerPage.once('dialog', (dialog) => void dialog.accept());
        const resetDone = managerPage.waitForResponse(
            (r) => r.url().includes('resetPermissions') && r.ok(),
            {timeout: 30_000}
        );
        await resetButton.click();
        await resetDone;
        await expect(
            managerPage.getByText('Preprint permissions were successfully reset.')
        ).toBeVisible({timeout: 30_000});

        await openWorkflow(managerPage, tag, submissionId);
        await screen.openPage('Permissions & Disclosure');
        await expect(holderInput).toHaveValue(serverName, {timeout: 30_000});
        await expect(screen.input('publicationLicense', 'licenseUrl')).toHaveValue(
            CC_BY
        );
        await expect(
            screen.input('publicationLicense', 'copyrightYear')
        ).toHaveValue(String(new Date().getFullYear()));

        // The landing page's copyright line follows (Rule 15).
        await page.goto(`/index.php/${tag}/preprint/view/${submissionId}`);
        const block = page.locator('.item.copyright');
        await expect(block).toBeVisible({timeout: 30_000});
        await expect(block).toContainText(
            `Copyright (c) ${new Date().getFullYear()} ${serverName}`
        );
    });

    test('S8: statements reach the reader', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        await opsApi.createContext({tag, users: contextUsers(tag)});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
            published: true,
        });

        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        const screen = new PublicationScreen(managerPage);

        // Before enabling: no "Data" entry (bounded by its sibling).
        await openWorkflow(managerPage, tag, submissionId);
        await expect(
            managerPage.getByRole('link', {name: 'Title & Abstract', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(screen.navLink('Data')).toHaveCount(0);

        // Enable the Data Availability Statement and the Funding Statement
        // (Rule 6 / Rule 16).
        let panel = await openMetadataSettings(managerPage, tag);
        await panel
            .getByRole('checkbox', {name: 'Enable data availability statement metadata'})
            .check();
        await panel
            .getByRole('checkbox', {name: 'Enable funding statement metadata'})
            .check();
        await saveSettingsPanel(managerPage, panel);

        // The Preprint area gains a "Data" entry; enter the statement there
        // and the Funding Statement on "Metadata" (scenario 8).
        await openWorkflow(managerPage, tag, submissionId);
        await screen.openPage('Data');
        await screen.fillRichText(
            'dataAvailability',
            'dataAvailability',
            'en',
            `Data are openly available ${tag}.`
        );
        await screen.save();
        await screen.openPage('Metadata');
        await screen.fillRichText(
            'metadata',
            'fundingStatement',
            'en',
            `Funded by the Example Fund ${tag}.`
        );
        await screen.save();

        // The reader's page shows both blocks with the texts (Rule 15).
        await page.goto(`/index.php/${tag}/preprint/view/${submissionId}`);
        const dataBlock = page.locator('.item.dataAvailability');
        const fundingBlock = page.locator('.item.fundingStatement');
        await expect(dataBlock).toBeVisible({timeout: 30_000});
        await expect(dataBlock).toContainText('Data Availability Statement');
        await expect(dataBlock).toContainText(`Data are openly available ${tag}.`);
        await expect(fundingBlock).toContainText('Funding Statement');
        await expect(fundingBlock).toContainText(`Funded by the Example Fund ${tag}.`);

        // Disabling the statement removes the "Data" entry (data citations
        // are off on this scratch server) while the published page keeps
        // showing the stored statement (Rule 16).
        panel = await openMetadataSettings(managerPage, tag);
        await panel
            .getByRole('checkbox', {name: 'Enable data availability statement metadata'})
            .uncheck();
        await saveSettingsPanel(managerPage, panel);
        await openWorkflow(managerPage, tag, submissionId);
        await expect(
            managerPage.getByRole('link', {name: 'Title & Abstract', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(screen.navLink('Data')).toHaveCount(0);

        await page.goto(`/index.php/${tag}/preprint/view/${submissionId}`);
        await expect(dataBlock).toBeVisible({timeout: 30_000});
        await expect(dataBlock).toContainText(`Data are openly available ${tag}.`);
    });

    test('S11: the license the author chose is already there', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('o11', testInfo);
        await opsApi.createContext({tag, users: contextUsers(tag)});

        const managerPage = await (await asUser(`${tag}mg`)).newPage();

        // The server has a DEFAULT license (CC BY), so a License URL with
        // no stored value would arrive locked — the contrast scenario 11
        // rides on.
        const licensePanel = await openLicenseSettings(managerPage, tag);
        await licensePanel
            .getByRole('radio', {name: 'CC Attribution 4.0', exact: true})
            .check();
        await saveSettingsPanel(managerPage, licensePanel);

        // The author submits a preprint choosing CC BY-SA in the wizard's
        // License section ("For Readers" step).
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
            submitted: false,
        });
        const authorPage = await (await asUser(`${tag}au`)).newPage();
        await authorPage.goto(wizardUrl(tag, submissionId));
        await expectWizardOpen(authorPage);
        await expectStep(authorPage, STEPS.files);
        await addGalleyFile(authorPage);
        await continueTo(authorPage, STEPS.details);
        await continueTo(authorPage, STEPS.contributors);
        await continueTo(authorPage, STEPS.readers);
        await authorPage
            .getByRole('radio', {name: 'CC Attribution-ShareAlike 4.0', exact: true})
            .check();
        await setRelationStatus(authorPage);
        await openReview(authorPage);
        await expect(problemsBanner(authorPage)).toHaveCount(0);
        await confirmSubmit(authorPage, {message: SUBMIT_DIALOGS.moderated});

        // Permissions & Disclosure holds the chosen address, unlocked — no
        // Override link — while the locked-with-Override presentation still
        // renders on the same page's empty Copyright Holder (the positive
        // control). The description sentence beneath License URL is OPS2's
        // open question and is not asserted.
        await openWorkflow(managerPage, tag, submissionId);
        const screen = new PublicationScreen(managerPage);
        await screen.openPage('Permissions & Disclosure');
        const licenseInput = screen.input('publicationLicense', 'licenseUrl');
        await expect(licenseInput).toHaveValue(/creativecommons\.org\/licenses\/by-sa\/4\.0/, {
            timeout: 30_000,
        });
        await expect(licenseInput).toBeEnabled();
        await expect(
            screen.overrideButton('publicationLicense', 'licenseUrl')
        ).toHaveCount(0);
        await expect(
            screen.overrideButton('publicationLicense', 'copyrightHolder', 'en')
        ).toBeVisible();

        // Post; the landing page's License block shows the chosen license's
        // sentence (scenario 11).
        await screen.openProductionStage();
        await postPreprint(managerPage);
        await page.goto(`/index.php/${tag}/preprint/view/${submissionId}`);
        const block = page.locator('.item.copyright');
        await expect(block).toBeVisible({timeout: 30_000});
        await expect(block).toContainText(
            'This work is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License.'
        );
    });
});
