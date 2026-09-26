// @ts-check
/**
 * @file playwright/tests/U40-publication-metadata.spec.js
 *
 * Publication metadata — OPS suite, one test per canonical COMMON scenario
 * as a preprint server runs it (S1–S8 and S12, in OPS vocabulary: the
 * workflow's Publication area is the "Preprint" nav group, pages are headed
 * "Preprint: {entry}", publishing is "Post"/"Unpost", the reader surface is
 * the preprint's landing page, there is no issue/scheduling machinery, the
 * author has no stage screen and the assistant of S12 is the Section
 * Editor, the "Moderator") plus the spec's OPS-specific S11 (the
 * wizard-chosen license arrives on Permissions & Disclosure unlocked).
 * S9 is {OJS} and S10 {OMP}. Every bold lead of a scenario has its
 * assertion here; a bullet the register marks carries only the scenario's
 * own sentence.
 * Spec: docs/specs/U40-publication-metadata.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section records everything else left out): A1, A2, A3,
 * A13 and A15 (🐞: the "Require" level, the 1970 year and the reset's reach
 * into unposted items, the greyed button after Cancel, the panel acting
 * before its loading settles are never asserted either way); A5 (no
 * scheduling on a preprint server); A8, A11, A14 and OPS2 (only the
 * scenario's own sentence is asserted: the typed Prefix, the holder
 * sentence with its "(Author)", the panel's refusal, the License URL
 * description beneath the wizard's choice); A10 (✅ retired 2026-09-21), A12 and A17
 * (never exercised).
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only at the server level — S1, S3, S4 and S12 mutate only their
 * own seeded submissions and assignments there (S1's Author is a throwaway
 * account, for the mailbox read's scoping); every settings mutation (S2,
 * S5–S8, S11) runs on a scratch preprint server with throwaway users, the
 * section policies of S2 seeded through `sections[]`. Waits are
 * event-based (publications/contexts API responses, the "Saved" form
 * status, web-first assertions) — no hard-coded sleeps. Every absence read
 * is bounded by a positive control taken the same way (PRINCIPLES M4, M6;
 * the mailbox reads by the discussion mail the test itself causes, A8).
 * Everything runs in the parallel `ops` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    PublicationScreen,
    openWorkflow,
    openPublicationPage,
    sendMailControl,
    statusReadout,
    postPreprint,
    unpostPreprint,
    createNewVersion,
    openEditAssignment,
    setEditAssignmentPermission,
    saveSettingsPanel,
    watchPublicationSaves,
    metadataUpdatedLogCount,
    addDiscussion,
    licenseBlock,
    expectPrecedes,
} = require('../pages/PublicationPages.js');
const {EditorialDashboardPage} = require('../pages/EditorialDashboardPage.js');
const {ContributorsScreen} = require('../pages/ContributorPages.js');
const {TasksPanel} = require('../../../../shared/playwright/pages/NotificationsPages.js');
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
const YEAR = String(new Date().getFullYear());
const POSTED_BANNER = 'This version has been posted and can not be edited.';
const REQUIRED = 'This field is required.';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u40${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
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

/**
 * Arm a browser-dialog recorder on a page: a `confirm()`/`alert()` the app
 * might raise on leaving a form is recorded (and dismissed) instead of
 * silently taking Playwright's default Cancel branch (patterns.md "Probe
 * kit"). Returns the record and a detach function.
 */
function recordBrowserPrompts(page) {
    const prompts = [];
    const onDialog = (dialog) => {
        prompts.push(`${dialog.type()}: ${dialog.message()}`);
        dialog.dismiss().catch(() => {});
    };
    page.on('dialog', onDialog);
    return {prompts, stop: () => page.off('dialog', onDialog)};
}

/**
 * The unsaved-edit drop (Rule 10): type `value` as Prefix on the open Title
 * & Abstract page, leave for "Metadata" and come back, then leave by
 * address (`reopen`) and come back: no prompt appeared, the only dialog is
 * the workflow panel, and Prefix is empty each time. Positive control, the
 * same Prefix read: the typed text is there before each move.
 */
async function expectUnsavedPrefixDropped(page, screen, value, reopen) {
    const prefix = screen.input('titleAbstract', 'prefix', 'en');
    const recorder = recordBrowserPrompts(page);
    await prefix.fill(value);
    await expect(prefix).toHaveValue(value);
    await screen.openPage('Metadata');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await screen.openPage('Title & Abstract');
    await expect(prefix).toHaveValue('', {timeout: 30_000});
    await prefix.fill(value);
    await expect(prefix).toHaveValue(value);
    await reopen();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(prefix).toHaveValue('', {timeout: 30_000});
    recorder.stop();
    expect(recorder.prompts).toEqual([]);
}

test.describe('Publication metadata (U40)', () => {
    test('S1: edit the title and abstract', {tag: '@smoke'}, async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const title = `Submission ${tag}`;
        // The Author is a throwaway account (created on a scratch server,
        // enrolled on the seeded server by the submission seed as the
        // wizard would), so the mailbox read below is scoped to an address
        // this test alone controls (A8).
        const author = `${tag}au`;
        await opsApi.createContext({tag, users: contextUsers(tag).slice(1)});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: PK,
            submitter: author,
            title,
        });

        const page = await (await asUser('manager.maya')).newPage();
        await openWorkflow(page, PK, submissionId);
        const screen = new PublicationScreen(page);
        await screen.openPage('Title & Abstract');

        // "Title & Abstract": the page carries Prefix (with its guidance),
        // Title, Subtitle and Abstract, filled with what the author entered
        // (Rule 1; Fields).
        await expect(page.getByText('Examples: A, The')).toBeVisible();
        await expect(screen.richTextBody('titleAbstract', 'title', 'en')).toContainText(
            title
        );
        await expect(screen.input('titleAbstract', 'prefix', 'en')).toBeVisible();
        await expect(
            screen.richTextBody('titleAbstract', 'subtitle', 'en')
        ).toBeVisible();
        // The Activity Log's baseline, for the Control's "one line per
        // Saved and none for a refusal" delta.
        const logBefore = await metadataUpdatedLogCount(page);

        // The save: "The" as Prefix, "A field note" as Subtitle, the Title
        // italic through the focused editor's "Formatting" menu, the
        // Abstract replaced; Save shows "Saved" (Rule 4).
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
        await screen.fillRichText('titleAbstract', 'subtitle', 'en', 'A field note');
        await screen.fillRichText('titleAbstract', 'abstract', 'en', 'Revised abstract.');
        const saves = watchPublicationSaves(page);
        await screen.save();
        expect(saves.seen).toHaveLength(1);

        // An empty Title: clearing the Title and saving is refused in the
        // browser: the summary with its "Go to Title" button, "This field
        // is required." under Title, and nothing sent (Rule 5; Fields).
        await screen.fillRichText('titleAbstract', 'title', 'en', '');
        await screen.saveButton().click();
        await expect(screen.errorSummary()).toHaveText(
            /^\s*Please correct one error\.\s*Go to Title: This field is required\.\s*Jump to next error\s*$/,
            {timeout: 30_000}
        );
        await expect(screen.goToErrorButton('Title')).toBeVisible();
        await expect(screen.fieldError('titleAbstract', 'title', 'en')).toHaveText(REQUIRED);
        await expect(page.getByRole('button', {name: 'Jump to next error'})).toBeVisible();
        expect(saves.seen).toHaveLength(1);

        // An empty Abstract: restore the title, clear the Abstract, Save:
        // "This field is required." under Abstract before the save is even
        // sent (Rule 5; Fields): the watcher that saw the accepted save
        // above sees no request for this one.
        // The title is restored the way an editor would after a slip: the
        // editor's own undo, which brings the italic back with it.
        await titleBody.click();
        await titleBody.press('ControlOrMeta+z');
        await expect(titleBody).toContainText(title);
        await page.evaluate(
            // @ts-ignore tinymce is the page's global
            (fieldId) => window.tinymce?.get(fieldId)?.fire('change'),
            screen.controlId('titleAbstract', 'title', 'en')
        );
        expect(await screen.readRichText('titleAbstract', 'title', 'en')).toMatch(/<(i|em)[\s>]/);
        await screen.fillRichText('titleAbstract', 'abstract', 'en', '');
        await screen.saveButton().click();
        await expect(screen.fieldError('titleAbstract', 'abstract', 'en')).toHaveText(
            REQUIRED,
            {timeout: 30_000}
        );
        await expect(screen.goToErrorButton('Abstract')).toBeVisible();
        await expect(screen.fieldError('titleAbstract', 'title', 'en')).toHaveCount(0);
        expect(saves.seen).toHaveLength(1);

        // After a reload: restore the abstract, Save, reload: prefix,
        // subtitle, italic title and abstract are as saved (Rule 4).
        await screen.fillRichText('titleAbstract', 'abstract', 'en', 'Revised abstract.');
        await screen.save();
        expect(saves.seen).toHaveLength(2);
        saves.stop();
        await openWorkflow(page, PK, submissionId);
        await screen.openPage('Title & Abstract');
        await expect(screen.input('titleAbstract', 'prefix', 'en')).toHaveValue('The');
        await expect(
            screen.richTextBody('titleAbstract', 'subtitle', 'en')
        ).toContainText('A field note');
        await expect(
            screen.richTextBody('titleAbstract', 'abstract', 'en')
        ).toContainText('Revised abstract.');
        const savedTitle = await screen.readRichText('titleAbstract', 'title', 'en');
        expect(savedTitle).toContain(title);
        expect(savedTitle).toMatch(/<(i|em)[\s>]/);

        // The dashboard and the log: the list's title reads with the new
        // prefix (the in-page search narrows the CURRENT view, so "Active
        // submissions" is opened first), and the Activity Log shows the
        // "Submission metadata updated" line (Fields; Side effects).
        // Control: exactly one line per "Saved" (two) and none for the
        // two refusals (Rule 4; Side effects).
        await openWorkflow(page, PK, submissionId);
        expect(await metadataUpdatedLogCount(page)).toBe(logBefore + 2);
        const dashboard = new EditorialDashboardPage(page, PK);
        await dashboard.gotoView('active');
        const row = await dashboard.findRowByTag(tag);
        await expect(row).toContainText(`The Submission ${tag}`);

        // The mailbox: no email has arrived for the Author from the saves
        // (Side effects), bounded by a mail this test causes the same way:
        // a discussion on a scratch server of the test's own, whose copy
        // reaches its spare Author (A8; `sendMailControl`).
        const afterControl = await sendMailControl({asUser, api: opsApi, tag});
        await pkpMail.expectNone({to: mailOf(author), afterControl});
    });

    test('S2: the Metadata page follows the server\'s setup', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s2', testInfo);
        // The first section (the renamed default) sets a Word Count of 50;
        // a second section does not require abstracts (footnote s2).
        await opsApi.createContext({
            tag,
            users: contextUsers(tag),
            sections: [
                {abbrev: 'PRE', title: {en: 'Preprints'}, wordCount: 50},
                {abbrev: 'NOA', title: {en: 'No Abstracts'}, abstractsNotRequired: true},
            ],
        });
        const [{submissionId}, second] = await Promise.all([
            opsApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: `${tag}au`,
                title: `Submission ${tag}`,
                abstract: `Seeded abstract ${tag} here.`,
            }),
            opsApi.createSubmission({
                tag: `${tag}n`,
                context: tag,
                submitter: `${tag}au`,
                title: `Submission ${tag}n`,
                section: 'NOA',
            }),
        ]);

        const page = await (await asUser(`${tag}mg`)).newPage();
        const screen = new PublicationScreen(page);

        // Control: before the untick the "Metadata" page shows "Keywords",
        // enabled on a fresh server, with a Save button (Rule 6).
        await openWorkflow(page, tag, submissionId);
        await screen.openPage('Metadata');
        const keywordsInput = screen
            .fieldWrapper('metadata', 'keywords', 'en')
            .locator('input.pkpAutosuggest__input');
        await expect(keywordsInput).toBeVisible({timeout: 30_000});
        await expect(screen.saveButton()).toBeVisible();

        // Nothing enabled: untick every "Enable … metadata" box (Rule 6);
        // the Metadata page reads its empty message, with no Save button.
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
        await openWorkflow(page, tag, submissionId);
        await screen.openPage('Metadata');
        await expect(
            page.getByText('No metadata fields are currently enabled.')
        ).toBeVisible({timeout: 30_000});
        await expect(screen.saveButton()).toHaveCount(0);

        // Two items enabled: Keywords and Coverage; the page shows exactly
        // those (Rule 6).
        panel = await openMetadataSettings(page, tag);
        await panel.getByRole('checkbox', {name: 'Enable keyword metadata'}).check();
        await panel.getByRole('checkbox', {name: 'Enable coverage metadata'}).check();
        await saveSettingsPanel(page, panel);

        await openWorkflow(page, tag, submissionId);
        await screen.openPage('Metadata');
        await expect(keywordsInput).toBeVisible({timeout: 30_000});
        await expect(screen.input('metadata', 'coverage', 'en')).toBeVisible();
        await expect(page.getByText('Subjects', {exact: true})).toHaveCount(0);
        await expect(page.getByText('Rights', {exact: true})).toHaveCount(0);

        // Keywords (Rule 7): Enter adds the typed term as a chip with its
        // "Remove {term}" button; the chip's button removes it; "benthic
        // flux", a term nobody has used before, is accepted as typed.
        // (Suggestions from other submissions are Rule 7b's, retired A10's —
        // never asserted.)
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
        const novelTerm = `benthic flux ${tag}`;
        await keywordsInput.pressSequentially(novelTerm, {delay: 15});
        await keywordsInput.press('Enter');
        const novelChip = page.getByRole('button', {name: `Remove ${novelTerm}`});
        await expect(novelChip).toBeVisible({timeout: 30_000});

        // Coverage off and on: "Pacific, 2020s" saved; disabling Coverage
        // hides the field but keeps the stored value; re-enabling shows it
        // again (Rule 6). Keywords is the positive control on the absence
        // read.
        await screen.input('metadata', 'coverage', 'en').fill('Pacific, 2020s');
        await screen.save();
        await openWorkflow(page, tag, submissionId);
        await screen.openPage('Metadata');
        await expect(chip).toBeVisible({timeout: 30_000});
        await expect(novelChip).toBeVisible();
        await expect(screen.input('metadata', 'coverage', 'en')).toHaveValue(
            'Pacific, 2020s'
        );
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
            'Pacific, 2020s',
            {timeout: 30_000}
        );

        // Plain Language Summary: enabled at "Ask the author…" (never
        // "Require" — A1): "Title & Abstract" shows "Plain Language
        // Summary" after Abstract (Rule 5; Fields; Settings). Publisher ID:
        // "Enable for Preprints" under "Publisher ID": the "Metadata" page
        // also shows "Publisher ID" (Fields; Settings); a preprint server
        // has no "Article Number".
        panel = await openMetadataSettings(page, tag);
        await panel
            .getByRole('checkbox', {name: 'Enable plain language summary metadata'})
            .check();
        await panel
            .getByRole('radio', {
                name: 'Ask the author to provide a plain language summary during submission.',
            })
            .check();
        await panel.getByRole('checkbox', {name: 'Enable for Preprints', exact: true}).check();
        await saveSettingsPanel(page, panel);
        await openWorkflow(page, tag, submissionId);
        await screen.openPage('Title & Abstract');
        const summaryWrapper = screen.fieldWrapper('titleAbstract', 'plainLanguageSummary', 'en');
        await expect(summaryWrapper).toContainText('Plain Language Summary', {timeout: 30_000});
        await expectPrecedes(screen.fieldWrapper('titleAbstract', 'abstract', 'en'), summaryWrapper);
        await screen.openPage('Metadata');
        // (The field's control id carries the "pub-id::publisher-id" key,
        // which a CSS id selector cannot take, so it is read by its label.)
        await expect(page.getByRole('textbox', {name: 'Publisher ID', exact: true})).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.getByText('Article Number', {exact: true})).toHaveCount(0);

        // Over the word limit: the first submission's Abstract shows "Word
        // Count: {n}/50"; 51 words give the counter its error mark; Save is
        // refused with the over-limit message and nothing is saved (the
        // seeded abstract is back after a reload) (Rule 5; Fields).
        await screen.openPage('Title & Abstract');
        const counter = screen.wordLimit('titleAbstract', 'abstract', 'en');
        await expect(counter).toHaveText(/Word Count: 4\/50/, {timeout: 30_000});
        await expect(screen.wordLimitErrorMark('titleAbstract', 'abstract', 'en')).toHaveCount(0);
        await screen.fillRichText(
            'titleAbstract',
            'abstract',
            'en',
            Array(51).fill('over').join(' ')
        );
        await expect(counter).toHaveText(/Word Count: 51\/50/, {timeout: 30_000});
        await expect(screen.wordLimitErrorMark('titleAbstract', 'abstract', 'en')).toHaveCount(1);
        await screen.saveButton().click();
        await expect(screen.fieldError('titleAbstract', 'abstract', 'en')).toHaveText(
            'The abstract is too long. It should be 50 words or less. It is currently 51 words long.',
            {timeout: 30_000}
        );
        await expect(screen.errorSummary()).toContainText('Please correct one error.');
        await openWorkflow(page, tag, submissionId);
        await screen.openPage('Title & Abstract');
        await expect(
            screen.richTextBody('titleAbstract', 'abstract', 'en')
        ).toContainText(`Seeded abstract ${tag} here.`, {timeout: 30_000});
        await expect(counter).toHaveText(/Word Count: 4\/50/);

        // No abstract required: the second submission's Abstract cleared
        // and saved: "Saved" (Rule 5; Fields); no counter, the section
        // setting no limit.
        await openWorkflow(page, tag, second.submissionId);
        await screen.openPage('Title & Abstract');
        await expect(
            screen.richTextBody('titleAbstract', 'abstract', 'en')
        ).toContainText(`Seeded abstract for ${tag}n.`, {timeout: 30_000});
        await expect(screen.wordLimit('titleAbstract', 'abstract', 'en')).toHaveCount(0);
        await screen.fillRichText('titleAbstract', 'abstract', 'en', '');
        await screen.save();
        await expect(screen.fieldError('titleAbstract', 'abstract', 'en')).toHaveCount(0);
        await openWorkflow(page, tag, second.submissionId);
        await screen.openPage('Title & Abstract');
        await expect(screen.input('titleAbstract', 'prefix', 'en')).toBeVisible({timeout: 30_000});
        expect(
            ((await screen.readRichText('titleAbstract', 'abstract', 'en')) || '').replace(/<[^>]+>|\s|&nbsp;/g, '')
        ).toBe('');
    });

    test('S3: the author before and after posting', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s3', testInfo);
        const {submissionId, publicationId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        // The author view: the Preprint area lists "Title & Abstract" and
        // "Metadata" and no "Permissions & Disclosure" (Rule 1; Actors row
        // 2; the manager's view below lists it — the positive control).
        // Before posting, the submitting author's own page saves like an
        // editor's ([OPS1]).
        const authorPage = await (await asUser('author.alex')).newPage();
        await openWorkflow(authorPage, PK, submissionId, {author: true});
        const authorScreen = new PublicationScreen(authorPage);
        await expect(authorScreen.navLink('Title & Abstract')).toBeVisible({timeout: 30_000});
        await expect(authorScreen.navLink('Metadata')).toBeVisible();
        await expect(authorScreen.navLink('Permissions & Disclosure')).toHaveCount(0);
        await authorScreen.openPage('Title & Abstract');
        await expect(authorScreen.saveButton()).toBeEnabled();
        await authorScreen.fillRichText(
            'titleAbstract',
            'abstract',
            'en',
            `Author abstract ${tag}.`
        );
        await authorScreen.save();

        // An unsaved edit: "The" as Prefix, "Metadata" and back, then by
        // address and back: no prompt, Prefix empty each time (Rule 10;
        // the page is editable on a preprint server, OPS1). The abstract
        // saved above is still there after.
        const prefix = authorScreen.input('titleAbstract', 'prefix', 'en');
        await expectUnsavedPrefixDropped(authorPage, authorScreen, `Draft ${tag}`, async () => {
            await openWorkflow(authorPage, PK, submissionId, {author: true});
            await authorScreen.openPage('Title & Abstract');
        });
        await expect(
            authorScreen.richTextBody('titleAbstract', 'abstract', 'en')
        ).toContainText(`Author abstract ${tag}.`);

        // The OPS author view has no stage screen and no language readout
        // anywhere (Rule 1 / Rule 13a, OPS markers) — bounded by the page
        // being open; the manager's readout in S6 is the cross-check that
        // the readout renders at all.
        await expect(
            authorPage.getByRole('link', {name: 'Production', exact: true})
        ).toHaveCount(0);
        await expect(authorScreen.languageReadout()).toHaveCount(0);

        // Posting: the manager posts the preprint through the screens; the
        // header reads "Status: Posted" (Rule 9). The manager's Preprint
        // area lists "Permissions & Disclosure" (the author view's control).
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        const managerScreen = new PublicationScreen(managerPage);
        await expect(managerScreen.navLink('Permissions & Disclosure')).toBeVisible({
            timeout: 30_000,
        });
        await managerScreen.openProductionStage();
        await postPreprint(managerPage);
        await expect(statusReadout(managerPage)).toContainText('Posted', {timeout: 30_000});

        // The posted version: the author's page carries the posted banner
        // and Save is disabled (Rule 9, OPS wording).
        await openWorkflow(authorPage, PK, submissionId, {author: true});
        await authorScreen.openPage('Title & Abstract');
        await expect(authorPage.getByText(POSTED_BANNER)).toBeVisible({timeout: 30_000});
        await expect(authorScreen.saveButton()).toBeDisabled();

        // The permission: on the Production stage's Participants panel the
        // Author's "Edit Assignment" box "Allow this person to make changes
        // to the publication…" reads ticked — on a preprint server it is
        // ticked from the start (Rule 2; OPS1), so nothing is ticked here;
        // Cancel leaves the window. The posted version stays read-only
        // with its banner (Rule 9).
        await openWorkflow(managerPage, PK, submissionId);
        await managerScreen.openProductionStage();
        const editModal = await openEditAssignment(managerPage, 'Alex Author');
        await expect(editModal.locator('input[name="canChangeMetadata"]')).toBeChecked();
        await editModal.getByRole('link', {name: 'Cancel', exact: true}).click();
        await expect(editModal).toHaveCount(0, {timeout: 30_000});
        await openWorkflow(authorPage, PK, submissionId, {author: true});
        await authorScreen.openPage('Title & Abstract');
        await expect(authorPage.getByText(POSTED_BANNER)).toBeVisible({timeout: 30_000});
        await expect(authorScreen.saveButton()).toBeDisabled();

        // A new version: "Create New Version", confirmed: the menu gains
        // "Author Original 1.1". The Author's Title & Abstract on it shows
        // no banner and Save is offered; the unsaved-edit drop holds on
        // this editable page too (Rules 9, 10). The posted version, read
        // the same way by address, keeps its banner and disabled Save —
        // the positive control.
        await openWorkflow(managerPage, PK, submissionId);
        const newPublication = await createNewVersion(managerPage);
        await expect(
            managerPage.getByRole('link', {name: 'Author Original 1.1', exact: true})
        ).toBeVisible({timeout: 30_000});

        await openPublicationPage(authorPage, PK, submissionId, publicationId, {author: true});
        await expect(statusReadout(authorPage)).toContainText('Posted', {timeout: 30_000});
        await expect(authorPage.getByText(POSTED_BANNER)).toBeVisible({timeout: 30_000});
        await expect(authorScreen.saveButton()).toBeDisabled();

        const openNewVersion = () =>
            openPublicationPage(authorPage, PK, submissionId, newPublication.id, {author: true});
        await openNewVersion();
        await expect(statusReadout(authorPage)).toContainText('Unpublished', {
            timeout: 30_000,
        });
        await expect(authorScreen.saveButton()).toBeEnabled({timeout: 30_000});
        await expect(authorPage.getByText(POSTED_BANNER)).toHaveCount(0);
        await expectUnsavedPrefixDropped(authorPage, authorScreen, `Draft ${tag}`, openNewVersion);

        // The Author's save on the new version, pressed while the other
        // version is still posted (A16 retired 2026-09-14): "The" as
        // Prefix, the footer reads "Saved", and after a reload Prefix reads
        // "The" (Rule 9).
        await prefix.fill('The');
        await authorScreen.save();
        await openNewVersion();
        await expect(prefix).toHaveValue('The', {timeout: 30_000});

        // The other version's own copy: the posted version still shows the
        // banner and its Prefix is empty (Rules 3, 9).
        await openPublicationPage(authorPage, PK, submissionId, publicationId, {author: true});
        await expect(authorPage.getByText(POSTED_BANNER)).toBeVisible({timeout: 30_000});
        await expect(prefix).toHaveValue('');
        await expect(authorScreen.saveButton()).toBeDisabled();

        // Control: the lock is the Author's: the manager's Title & Abstract
        // on the posted version stays editable, with the "Warning: This
        // version has been published…" banner (Rule 8).
        await openPublicationPage(managerPage, PK, submissionId, publicationId);
        await expect(managerScreen.publishedWarning()).toBeVisible({timeout: 30_000});
        await expect(managerScreen.saveButton()).toBeEnabled();
        await expect(managerPage.getByText(POSTED_BANNER)).toHaveCount(0);

        // After an unpost: with two versions the workflow opens on the
        // newest one, so the posted version is opened by address; its
        // header carries "Unpost". The Author then saves AT ONCE on the
        // formerly posted version, with no re-tick of the permission
        // (Rule 9; A4 retired): "The" typed as Prefix is kept after a
        // reload; the new version still carries its "The", and neither
        // page carries the banner any more.
        await unpostPreprint(managerPage);
        for (const versionId of [publicationId, newPublication.id]) {
            await openPublicationPage(authorPage, PK, submissionId, versionId, {
                author: true,
            });
            await expect(authorScreen.saveButton()).toBeEnabled({timeout: 30_000});
            await expect(authorPage.getByText(POSTED_BANNER)).toHaveCount(0);
            if (versionId === publicationId) {
                await prefix.fill('The');
                await authorScreen.save();
                await openPublicationPage(authorPage, PK, submissionId, versionId, {
                    author: true,
                });
            }
            await expect(prefix).toHaveValue('The', {timeout: 30_000});
        }
    });

    test('S4: editing a posted version reaches readers at once', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            abstract: `Submitted abstract ${tag}.`,
            published: true,
        });
        const landing = `/index.php/${PK}${PK_PREFIX}/preprint/view/${submissionId}`;

        // Control: before the save the landing page shows the abstract as
        // submitted (Rule 8).
        await page.goto(landing);
        await expect(
            page.getByRole('heading', {name: `Submission ${tag}`})
        ).toBeVisible({timeout: 30_000});
        await expect(page.getByText(`Submitted abstract ${tag}.`)).toBeVisible();

        // The banner: every Publication page of the posted version warns
        // the editor (Rule 8; base wording on all three apps).
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        const screen = new PublicationScreen(managerPage);
        const warning = screen.publishedWarning();
        await screen.openPage('Title & Abstract');
        await expect(warning).toBeVisible({timeout: 30_000});
        await screen.openPage('Metadata');
        await expect(warning).toBeVisible({timeout: 30_000});
        await screen.openPage('Permissions & Disclosure');
        await expect(warning).toBeVisible({timeout: 30_000});

        // The save: the form stays editable; the Abstract replaced with
        // "Abstract after publication." and saved: "Saved" (Rules 4, 8).
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
                `Abstract after publication ${tag}.`
            );
            const response = await screen.save();
            const publication = await response.json();
            expect(publication.abstract?.en ?? '').toContain(
                `Abstract after publication ${tag}.`
            );
        }).toPass({intervals: [1_000, 2_000], timeout: 90_000});

        // The reader's page: the anonymous reader sees the new abstract at
        // once on the preprint's landing page, the submitted one gone.
        await page.goto(landing);
        await expect(
            page.getByRole('heading', {name: `Submission ${tag}`})
        ).toBeVisible({timeout: 30_000});
        await expect(page.getByText(`Abstract after publication ${tag}.`)).toBeVisible();
        await expect(page.getByText(`Submitted abstract ${tag}.`)).toHaveCount(0);
    });

    test('S5: copyright and license — defaults, override, post', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s5', testInfo);
        const controlTag = `${tag}c`;
        await opsApi.createContext({tag, users: contextUsers(tag)});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
        });
        const landing = `/index.php/${tag}/preprint/view/${submissionId}`;
        const terms = `License terms paragraph ${tag}.`;

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
        await termsBody.fill(terms);
        await saveSettingsPanel(managerPage, licensePanel);

        // The locked fields: the three arrive locked, each with its
        // automatic-value sentence and an Override link (Rule 11; OPS
        // "… posted." wording; the holder sentence carries the
        // contributor's role, the scenario's own sentence for [A11]).
        await openWorkflow(managerPage, tag, submissionId);
        const screen = new PublicationScreen(managerPage);
        await screen.openPage('Permissions & Disclosure');

        const holderInput = screen.input('publicationLicense', 'copyrightHolder', 'en');
        const yearInput = screen.input('publicationLicense', 'copyrightYear');
        const licenseInput = screen.input('publicationLicense', 'licenseUrl');
        const holderWrapper = screen.fieldWrapper('publicationLicense', 'copyrightHolder', 'en');
        const licenseWrapper = screen.fieldWrapper('publicationLicense', 'licenseUrl');
        const holderSentence =
            'Copyright will be assigned automatically to Ada Author (Author) when this is posted.';
        const licenseSentence =
            'The license will be set automatically to CC Attribution 4.0 when this is posted.';
        await expect(holderInput).toBeDisabled();
        await expect(yearInput).toBeDisabled();
        await expect(licenseInput).toBeDisabled();
        await expect(holderWrapper).toContainText(holderSentence);
        await expect(screen.overrideButton('publicationLicense', 'copyrightHolder', 'en')).toBeVisible();
        await expect(
            screen.fieldWrapper('publicationLicense', 'copyrightYear')
        ).toContainText(
            'The copyright year will be set automatically based on the posted date.'
        );
        await expect(screen.overrideButton('publicationLicense', 'copyrightYear')).toBeVisible();
        await expect(licenseWrapper).toContainText(licenseSentence);
        await expect(screen.overrideButton('publicationLicense', 'licenseUrl')).toBeVisible();

        // The override: Override under Copyright Holder, "Example Society",
        // Save: "Saved" (Rule 11).
        await screen.overrideButton('publicationLicense', 'copyrightHolder', 'en').click();
        await expect(holderInput).toBeEnabled();
        await holderInput.fill('Example Society');
        await screen.save();

        // A refused License URL: Override under License URL, "licence",
        // Save: "This is not a valid URL." under License URL with the
        // summary and its "Go to License URL" button, nothing saved; after
        // a reload License URL is locked again with its sentence (Rule 4;
        // Fields).
        await screen.overrideButton('publicationLicense', 'licenseUrl').click();
        await expect(licenseInput).toBeEnabled();
        await licenseInput.fill('licence');
        await screen.saveButton().click();
        await expect(screen.fieldError('publicationLicense', 'licenseUrl')).toHaveText(
            'This is not a valid URL.',
            {timeout: 30_000}
        );
        await expect(screen.errorSummary()).toHaveText(
            /^\s*Please correct one error\.\s*Go to License URL: This is not a valid URL\.\s*Jump to next error\s*$/
        );
        await expect(screen.goToErrorButton('License URL')).toBeVisible();
        await expect(managerPage.getByRole('button', {name: 'Jump to next error'})).toBeVisible();
        await openWorkflow(managerPage, tag, submissionId);
        await screen.openPage('Permissions & Disclosure');
        await expect(licenseInput).toBeDisabled({timeout: 30_000});
        await expect(licenseWrapper).toContainText(licenseSentence);
        await expect(screen.overrideButton('publicationLicense', 'licenseUrl')).toBeVisible();
        await expect(holderInput).toHaveValue('Example Society');

        // Publishing: posting fills the still-empty fields from the
        // defaults and never overwrites the override (Rule 12).
        await screen.openProductionStage();
        await postPreprint(managerPage);
        await openWorkflow(managerPage, tag, submissionId);
        await screen.openPage('Permissions & Disclosure');
        await expect(holderInput).toHaveValue('Example Society', {timeout: 30_000});
        await expect(yearInput).toHaveValue(YEAR);
        await expect(licenseInput).toHaveValue(CC_BY);
        await expect(holderInput).toBeEnabled();
        await expect(yearInput).toBeEnabled();
        await expect(licenseInput).toBeEnabled();

        // The reader's page (Rule 15): the "License" block with the
        // copyright line naming the override, the Creative Commons badge
        // and sentence, the License Terms. No statement blocks: neither a
        // "Data Availability Statement" nor a "Funding Statement" heading,
        // both fields being empty (the License block on the same page is
        // the positive control).
        const block = licenseBlock(page);
        const ccSentence =
            'This work is licensed under a Creative Commons Attribution 4.0 International License.';
        await page.goto(landing);
        await expect(block).toBeVisible({timeout: 30_000});
        await expect(block).toContainText(`Copyright (c) ${YEAR} Example Society`);
        await expect(block).toContainText(ccSentence);
        await expect(block.locator('img')).toBeVisible();
        await expect(block).toContainText(terms);
        await expect(page.locator('.item.dataAvailability')).toHaveCount(0);
        await expect(page.locator('.item.fundingStatement')).toHaveCount(0);
        await expect(page.getByRole('heading', {name: 'Data Availability Statement'})).toHaveCount(0);
        await expect(page.getByRole('heading', {name: 'Funding Statement'})).toHaveCount(0);

        // Another License URL: "https://example.org/license" saved: the
        // block now shows a link to that address labelled with the
        // copyright statement in place of the badge, the terms below it
        // (Rule 15).
        await licenseInput.fill('https://example.org/license');
        await screen.save();
        await page.goto(landing);
        const licenseLink = block.locator('a.copyright');
        await expect(licenseLink).toBeVisible({timeout: 30_000});
        await expect(licenseLink).toHaveAttribute('href', 'https://example.org/license');
        await expect(licenseLink).toHaveText(new RegExp(`^\\s*Copyright \\(c\\) ${YEAR} Example Society\\s*$`));
        await expect(block.locator('img')).toHaveCount(0);
        await expect(block).not.toContainText(ccSentence);
        await expectPrecedes(licenseLink, block.getByText(terms));

        // The override cleared: Copyright Holder cleared and saved:
        // "Saved"; after a reload it is locked again with its sentence and
        // "Override" (Rule 11); the landing page's link now reads
        // "License" and no "Copyright (c)" line shows (Rule 15).
        await holderInput.fill('');
        await screen.save();
        await openWorkflow(managerPage, tag, submissionId);
        await screen.openPage('Permissions & Disclosure');
        await expect(holderInput).toBeDisabled({timeout: 30_000});
        await expect(holderWrapper).toContainText(holderSentence);
        await expect(screen.overrideButton('publicationLicense', 'copyrightHolder', 'en')).toBeVisible();
        await expect(licenseInput).toHaveValue('https://example.org/license');
        await page.goto(landing);
        await expect(licenseLink).toBeVisible({timeout: 30_000});
        await expect(licenseLink).toHaveText(/^\s*License\s*$/);
        await expect(block).not.toContainText('Copyright (c)');
        await expect(block).toContainText(terms);

        // Terms without a license: License URL cleared and saved: the
        // block is the "License" heading and the License Terms paragraph
        // alone (Rule 15).
        await licenseInput.fill('');
        await screen.save();
        await page.goto(landing);
        await expect(block).toBeVisible({timeout: 30_000});
        await expect(block.locator('a.copyright')).toHaveCount(0);
        await expect(block.locator('img')).toHaveCount(0);
        await expect(block).toHaveText(new RegExp(`^\\s*License\\s*${terms.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`));

        // The server without a default license: on the second server the
        // posted item's "Permissions & Disclosure" reads Copyright Holder
        // the server's name, unlocked, no holder having been chosen
        // (Rule 12), and License URL empty and plain-editable, with no
        // description and no "Override" (Rule 11; Fields; the first
        // server's locked License URL, read the same way above, is the
        // control). Control: that item's landing page has no "License"
        // block at all, the server having no default license and no terms
        // (Rule 15) — bounded by the page having rendered.
        await opsApi.createContext({tag: controlTag, users: contextUsers(controlTag)});
        const control = await opsApi.createSubmission({
            tag: `${controlTag}s`,
            context: controlTag,
            submitter: `${controlTag}au`,
            title: `Submission ${controlTag}`,
            published: true,
        });
        const controlPage = await (await asUser(`${controlTag}mg`)).newPage();
        await openWorkflow(controlPage, controlTag, control.submissionId);
        const controlScreen = new PublicationScreen(controlPage);
        await controlScreen.openPage('Permissions & Disclosure');
        const controlHolder = controlScreen.input('publicationLicense', 'copyrightHolder', 'en');
        const controlLicense = controlScreen.input('publicationLicense', 'licenseUrl');
        await expect(controlHolder).toHaveValue(`Scratch context ${controlTag}`, {timeout: 30_000});
        await expect(controlHolder).toBeEnabled();
        await expect(controlScreen.overrideButton('publicationLicense', 'copyrightHolder', 'en')).toHaveCount(0);
        await expect(controlLicense).toHaveValue('');
        await expect(controlLicense).toBeEnabled();
        await expect(controlScreen.overrideButton('publicationLicense', 'licenseUrl')).toHaveCount(0);
        await expect(
            controlScreen.fieldWrapper('publicationLicense', 'licenseUrl')
        ).not.toContainText('The license will be set automatically');
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
        test.setTimeout(240_000);
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
        const institution = `Example Institute ${tag}`;

        const page = await (await asUser(`${tag}mg`)).newPage();
        await openWorkflow(page, tag, submissionId);
        const screen = new PublicationScreen(page);

        // The contributor gets a hand-typed affiliation in the first
        // language, for the copied-names read after the change.
        const contributors = new ContributorsScreen(page);
        await contributors.openFromWorkflow();
        let editPanel = await contributors.openEditPanel('Ada');
        await contributors.addTypedAffiliation(editPanel, institution);
        // A seeded user has no Country, and the form requires one
        // (seed-facts.md).
        await contributors.input('country').selectOption({label: 'Canada'});
        await contributors.saveForm(editPanel);

        // The readout and the button (Rule 13a): a Publication page shows
        // the readout WITH "Change"; the stage screen shows it without.
        await screen.openPage('Title & Abstract');
        await expect(screen.languageReadout()).toContainText('English');
        await expect(screen.changeLanguageButton()).toBeVisible();
        await screen.openProductionStage();
        await expect(screen.languageReadout()).toContainText('English', {
            timeout: 30_000,
        });
        await expect(screen.changeLanguageButton()).toHaveCount(0);

        // Cancel (Rules 13b, 13c): the panel names the item and offers
        // both languages; Cancel closes it with nothing changed.
        await screen.openPage('Title & Abstract');
        await screen.changeLanguageButton().click();
        const panel = screen.changeLanguagePanel();
        await expect(panel.getByText('Change Submission Language For')).toBeVisible({
            timeout: 30_000,
        });
        await expect(panel).toContainText(`Submission ${tag}`);
        await expect(panel.getByRole('radio', {name: 'English'})).toBeChecked();
        await expect(panel.getByRole('radio', {name: 'French (Canada)'})).toBeVisible();
        await panel.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(panel).toHaveCount(0, {timeout: 30_000});
        await expect(screen.languageReadout()).toContainText('English');

        // The panel's boxes (Rule 13b): picking French reveals the warning
        // with a Title box and, the section requiring abstracts, an
        // Abstract box.
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
        const frAbstract = page
            .frameLocator('iframe#changeSubmissionLanguageMetadata-abstract-control_ifr')
            .locator('body');
        const abstractField = panel
            .locator('.pkpFormField')
            .filter({has: page.locator('#changeSubmissionLanguageMetadata-abstract-control')});
        await expect(abstractField).toContainText('Abstract');
        await frTitle.click();
        await frTitle.press('ControlOrMeta+a');
        await frTitle.press('Delete');
        await frTitle.fill(`Titre ${tag}`);
        await frAbstract.click();
        await frAbstract.press('ControlOrMeta+a');
        await frAbstract.press('Delete');
        await expect(frTitle).toContainText(`Titre ${tag}`);

        // A refused Confirm (the scenario's own sentence for [A14]): with
        // the Abstract empty, Confirm shows "This field is required." under
        // Abstract and nothing is sent — the same watcher records the
        // accepted Confirm's request below.
        const changeRequests = [];
        const onRequest = (request) => {
            if (request.url().includes('/changeLocale')) {
                changeRequests.push(request.url());
            }
        };
        page.on('request', onRequest);
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        await expect(abstractField.locator('.pkpFieldError')).toHaveText(REQUIRED, {
            timeout: 30_000,
        });
        await expect(panel.getByText('Change Submission Language For')).toBeVisible();
        expect(changeRequests).toEqual([]);

        // Confirm: with the Abstract typed, Confirm switches the language:
        // the screen reloads on Title & Abstract, open in French; the
        // readout names French; the English title is behind the language
        // bar (Rules 3, 13c).
        await frAbstract.click();
        await frAbstract.fill(`Resume ${tag}.`);
        await expect(frAbstract).toContainText(`Resume ${tag}.`);
        const changed = page.waitForResponse(
            (r) =>
                r.url().includes('/changeLocale') &&
                ['PUT', 'POST'].includes(r.request().method()) &&
                r.ok(),
            {timeout: 30_000}
        );
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        await changed;
        page.off('request', onRequest);
        expect(changeRequests).toHaveLength(1);
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

        // The copied names (Rule 13c; Side effects): the contributor's
        // "Edit" form shows the given and family names and the affiliation
        // in French, copied from English.
        await contributors.openFromWorkflow();
        editPanel = await contributors.openEditPanel('Ada');
        await expect(contributors.input('givenName', 'fr_CA')).toHaveValue('Ada', {
            timeout: 30_000,
        });
        await expect(contributors.input('familyName', 'fr_CA')).toHaveValue('Author');
        await expect(contributors.affiliationRow(editPanel, institution)).toBeVisible();
        await contributors.openAffiliationRowAction(editPanel, institution, 'Edit institution name');
        await expect(
            contributors
                .affiliationRow(editPanel, institution)
                .getByLabel(/Type the institution name in French/)
        ).toHaveValue(institution, {timeout: 30_000});
        await expect(
            contributors
                .affiliationRow(editPanel, institution)
                .getByLabel(/Type the institution name in English/)
        ).toHaveValue(institution);

        // Without the button (13a; the scenario's sentence for [A6]): the
        // posted preprint shows neither readout nor "Change" on a
        // Publication page, while its stage screen keeps the readout.
        await openWorkflow(page, tag, posted.submissionId);
        await screen.openPage('Title & Abstract');
        await expect(screen.languageReadout()).toHaveCount(0);
        await expect(screen.changeLanguageButton()).toHaveCount(0);
        await screen.openProductionStage();
        await expect(screen.languageReadout()).toContainText('English', {
            timeout: 30_000,
        });
        await expect(screen.changeLanguageButton()).toHaveCount(0);

        // Control: the Author's Publication pages show no readout and never
        // the button; on a preprint server the Author has no stage screen
        // and sees no readout anywhere (Rule 13a) — bounded by the page
        // being open, the manager's readout above the positive control.
        const authorPage = await (await asUser(`${tag}au`)).newPage();
        await openWorkflow(authorPage, tag, posted.submissionId, {author: true});
        const authorScreen = new PublicationScreen(authorPage);
        await authorScreen.openPage('Title & Abstract');
        await expect(authorScreen.languageReadout()).toHaveCount(0);
        await expect(authorScreen.changeLanguageButton()).toHaveCount(0);
        await expect(authorScreen.navLink('Production')).toHaveCount(0);
        await openWorkflow(authorPage, tag, submissionId, {author: true});
        await authorScreen.openPage('Title & Abstract');
        await expect(
            authorScreen.richTextBody('titleAbstract', 'title', 'fr_CA')
        ).toContainText(`Titre ${tag}`, {timeout: 30_000});
        await expect(authorScreen.languageReadout()).toHaveCount(0);
        await expect(authorScreen.changeLanguageButton()).toHaveCount(0);
        await expect(authorScreen.navLink('Production')).toHaveCount(0);
    });

    test('S7: reset every preprint\'s permissions', async ({asUser, opsApi, page, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s7', testInfo);
        const serverName = `Scratch Server ${tag}`;
        const author = `${tag}au`;
        // A second throwaway manager is the discussion participant of the
        // mailbox read's positive control (the form needs two).
        const otherManager = `${tag}m2`;
        await opsApi.createContext({
            tag,
            context: {name: {en: serverName}},
            users: [
                ...contextUsers(tag),
                {
                    username: otherManager,
                    givenName: 'Milo',
                    familyName: 'Manager',
                    email: mailOf(otherManager),
                    roles: ['manager'],
                },
            ],
        });
        const [{submissionId}, unposted] = await Promise.all([
            opsApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: author,
                title: `Submission ${tag}`,
                published: true,
            }),
            opsApi.createSubmission({
                tag: `${tag}u`,
                context: tag,
                submitter: author,
                title: `Submission ${tag}u`,
                // The discussion form lists the stage's participants only,
                // so the second manager is assigned to the stage.
                participants: [{username: otherManager, role: 'manager'}],
            }),
        ]);

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

        // Control: before OK the posted item's Permissions & Disclosure
        // reads "Example Society" and the unposted submission's Copyright
        // Holder and Copyright Year are locked and empty (Rules 11, 12).
        await openWorkflow(managerPage, tag, submissionId);
        await screen.openPage('Permissions & Disclosure');
        await expect(holderInput).toHaveValue('Example Society', {timeout: 30_000});
        await openWorkflow(managerPage, tag, unposted.submissionId);
        await screen.openPage('Permissions & Disclosure');
        await expect(holderInput).toBeDisabled({timeout: 30_000});
        await expect(holderInput).toHaveValue('');
        await expect(screen.input('publicationLicense', 'copyrightYear')).toBeDisabled();
        await expect(screen.input('publicationLicense', 'copyrightYear')).toHaveValue('');

        // The confirm box: Tools › Permissions, "Reset Preprint
        // Permissions": the browser's own confirm box (Rule 14). Cancel
        // sends nothing; the page is reloaded before the second attempt
        // (the in-place button state after Cancel is A13 — not asserted).
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

        // Cancel: nothing changed, the override is still there.
        await openWorkflow(managerPage, tag, submissionId);
        await screen.openPage('Permissions & Disclosure');
        await expect(holderInput).toHaveValue('Example Society', {timeout: 30_000});

        // OK: reload the tool, confirm with OK: the success toast appears
        // (Rule 14).
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

        // The published item: its Permissions & Disclosure now shows the
        // server's default holder instead of "Example Society", and the
        // landing page's copyright line follows (Rule 14; the unposted
        // item's values after the reset are A2/A3 territory — not
        // asserted).
        await openWorkflow(managerPage, tag, submissionId);
        await screen.openPage('Permissions & Disclosure');
        await expect(holderInput).toHaveValue(serverName, {timeout: 30_000});
        await expect(screen.input('publicationLicense', 'licenseUrl')).toHaveValue(
            CC_BY
        );
        await expect(
            screen.input('publicationLicense', 'copyrightYear')
        ).toHaveValue(YEAR);
        await page.goto(`/index.php/${tag}/preprint/view/${submissionId}`);
        const block = licenseBlock(page);
        await expect(block).toBeVisible({timeout: 30_000});
        await expect(block).toContainText(`Copyright (c) ${YEAR} ${serverName}`);

        // Nobody else is told (Side effects): no email has arrived for the
        // Author from the reset, bounded by a mail this test causes the
        // same way (a discussion between the two managers, the Author's
        // box left unticked, whose copy reaches the other manager, A8);
        // and the Author, signed in, finds no notification of it in the
        // Tasks window — bounded by a second discussion, with the Author's
        // box ticked, whose row does arrive there.
        const control = `Control ${tag}`;
        await openWorkflow(managerPage, tag, unposted.submissionId);
        await screen.openProductionStage();
        await addDiscussion(managerPage, {
            name: control,
            message: `Control message ${tag}.`,
            participants: [otherManager],
        });
        await pkpMail.expectNone({
            to: mailOf(author),
            afterControl: {to: mailOf(otherManager), subject: control},
        });

        const authorPage = await (await asUser(author)).newPage();
        const tasks = new TasksPanel(authorPage);
        await authorPage.goto(`/index.php/${tag}/dashboard/mySubmissions`);
        await expect(tasks.bell()).toBeVisible({timeout: 30_000});
        await tasks.open();
        const rowsBefore = await tasks.rowTexts();
        expect(rowsBefore.filter((row) => /permission|reset/i.test(row))).toEqual([]);
        await tasks.close();

        const notice = `Notice ${tag}`;
        await openWorkflow(managerPage, tag, unposted.submissionId);
        await screen.openProductionStage();
        await addDiscussion(managerPage, {
            name: notice,
            message: `Notice message ${tag}.`,
            participants: [author],
        });
        await authorPage.goto(`/index.php/${tag}/dashboard/mySubmissions`);
        await expect(tasks.bell()).toBeVisible({timeout: 30_000});
        await tasks.open();
        await expect(tasks.row(notice)).toHaveCount(1, {timeout: 30_000});
        const rowsAfter = await tasks.rowTexts();
        expect(rowsAfter).toHaveLength(rowsBefore.length + 1);
        expect(rowsAfter.filter((row) => /permission|reset/i.test(row))).toEqual([]);
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
        const landing = `/index.php/${tag}/preprint/view/${submissionId}`;
        const dataBlock = page.locator('.item.dataAvailability');
        const fundingBlock = page.locator('.item.fundingStatement');

        // Control: with both fields empty, the posted page shows neither
        // heading (Rule 15) — bounded by the page's own title.
        await page.goto(landing);
        await expect(
            page.getByRole('heading', {name: `Submission ${tag}`})
        ).toBeVisible({timeout: 30_000});
        await expect(dataBlock).toHaveCount(0);
        await expect(fundingBlock).toHaveCount(0);
        await expect(page.getByRole('heading', {name: 'Data Availability Statement'})).toHaveCount(0);
        await expect(page.getByRole('heading', {name: 'Funding Statement'})).toHaveCount(0);

        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        const screen = new PublicationScreen(managerPage);

        // Before enabling: no "Data" entry (bounded by its sibling).
        await openWorkflow(managerPage, tag, submissionId);
        await expect(screen.navLink('Title & Abstract')).toBeVisible({timeout: 30_000});
        await expect(screen.navLink('Data')).toHaveCount(0);

        // The settings: the Data Availability Statement and the Funding
        // Statement enabled (Rules 6, 16; Settings): the Preprint area
        // gains a "Data" entry.
        let panel = await openMetadataSettings(managerPage, tag);
        await panel
            .getByRole('checkbox', {name: 'Enable data availability statement metadata'})
            .check();
        await panel
            .getByRole('checkbox', {name: 'Enable funding statement metadata'})
            .check();
        await saveSettingsPanel(managerPage, panel);

        // The statements: "Data are held by the authors." on "Data", the
        // Funding Statement on "Metadata", each saved (Rule 16; Fields).
        await openWorkflow(managerPage, tag, submissionId);
        await screen.openPage('Data');
        await screen.fillRichText(
            'dataAvailability',
            'dataAvailability',
            'en',
            `Data are held by the authors ${tag}.`
        );
        await screen.save();
        await screen.openPage('Metadata');
        await screen.fillRichText(
            'metadata',
            'fundingStatement',
            'en',
            `Funded by the Example Society ${tag}.`
        );
        await screen.save();

        // The reader's page shows both blocks with the texts, in that
        // order (Rule 15).
        await page.goto(landing);
        await expect(dataBlock).toBeVisible({timeout: 30_000});
        await expect(dataBlock).toContainText('Data Availability Statement');
        await expect(dataBlock).toContainText(`Data are held by the authors ${tag}.`);
        await expect(fundingBlock).toContainText('Funding Statement');
        await expect(fundingBlock).toContainText(`Funded by the Example Society ${tag}.`);
        await expectPrecedes(dataBlock, fundingBlock);

        // The statement disabled: the "Data" entry disappears (data
        // citations are off on this scratch server) while the posted page
        // keeps showing the stored statement (Rules 15, 16).
        panel = await openMetadataSettings(managerPage, tag);
        await panel
            .getByRole('checkbox', {name: 'Enable data availability statement metadata'})
            .uncheck();
        await saveSettingsPanel(managerPage, panel);
        await openWorkflow(managerPage, tag, submissionId);
        await expect(screen.navLink('Title & Abstract')).toBeVisible({timeout: 30_000});
        await expect(screen.navLink('Data')).toHaveCount(0);

        await page.goto(landing);
        await expect(dataBlock).toBeVisible({timeout: 30_000});
        await expect(dataBlock).toContainText(`Data are held by the authors ${tag}.`);
        await expect(fundingBlock).toBeVisible();
    });

    test('S11: the license the author chose is already there', async ({asUser, opsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('o11', testInfo);
        await opsApi.createContext({tag, users: contextUsers(tag)});

        const managerPage = await (await asUser(`${tag}mg`)).newPage();

        // The server has a DEFAULT license (CC BY), so a License URL with
        // no stored value arrives locked — the contrast scenario 11 rides
        // on.
        const licensePanel = await openLicenseSettings(managerPage, tag);
        await licensePanel
            .getByRole('radio', {name: 'CC Attribution 4.0', exact: true})
            .check();
        await saveSettingsPanel(managerPage, licensePanel);

        // The wizard: the author submits a preprint choosing CC BY-SA in
        // the wizard's License section ("For Readers" step).
        const [{submissionId}, seeded] = await Promise.all([
            opsApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: `${tag}au`,
                title: `Submission ${tag}`,
                submitted: false,
            }),
            // Control: a second submission seeded past the wizard with no
            // license choice.
            opsApi.createSubmission({
                tag: `${tag}c`,
                context: tag,
                submitter: `${tag}au`,
                title: `Submission ${tag}c`,
            }),
        ]);
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

        // "Permissions & Disclosure": License URL holds the chosen address,
        // unlocked (no Override link), while the sentence beneath still
        // names the server's default license (the scenario's own sentence
        // for [OPS2]); the locked-with-Override presentation still renders
        // on the same page's empty Copyright Holder.
        await openWorkflow(managerPage, tag, submissionId);
        const screen = new PublicationScreen(managerPage);
        await screen.openPage('Permissions & Disclosure');
        const licenseInput = screen.input('publicationLicense', 'licenseUrl');
        const licenseSentence =
            'The license will be set automatically to CC Attribution 4.0 when this is posted.';
        await expect(licenseInput).toHaveValue(/creativecommons\.org\/licenses\/by-sa\/4\.0/, {
            timeout: 30_000,
        });
        await expect(licenseInput).toBeEnabled();
        await expect(
            screen.overrideButton('publicationLicense', 'licenseUrl')
        ).toHaveCount(0);
        await expect(screen.fieldWrapper('publicationLicense', 'licenseUrl')).toContainText(
            licenseSentence
        );
        await expect(
            screen.overrideButton('publicationLicense', 'copyrightHolder', 'en')
        ).toBeVisible();

        // The reader's page: posted, the landing page's License block shows
        // the chosen license's badge and sentence (Rule 15).
        await screen.openProductionStage();
        await postPreprint(managerPage);
        await page.goto(`/index.php/${tag}/preprint/view/${submissionId}`);
        const block = licenseBlock(page);
        await expect(block).toBeVisible({timeout: 30_000});
        await expect(block.locator('img')).toBeVisible();
        await expect(block).toContainText(
            'This work is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License.'
        );

        // Control: the submission seeded without a wizard choice arrives
        // with License URL locked under the same sentence, with its
        // Override link (Rule 11).
        await openWorkflow(managerPage, tag, seeded.submissionId);
        await screen.openPage('Permissions & Disclosure');
        await expect(licenseInput).toBeDisabled({timeout: 30_000});
        await expect(licenseInput).toHaveValue('');
        await expect(screen.overrideButton('publicationLicense', 'licenseUrl')).toBeVisible();
        await expect(screen.fieldWrapper('publicationLicense', 'licenseUrl')).toContainText(
            licenseSentence
        );
    });

    test('S12: a Moderator saves only with the permission', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s12', testInfo);
        // The seeded server enrols no Copyeditor and has the Production
        // stage only, so the participant is the Section Editor (the
        // "Moderator"), seeded on the scratch submission's one stage with
        // the role's default (footnote s12); the roster stays untouched.
        const moderator = 'sectioneditor.ana';
        const moderatorName = 'Ana Section Editor';
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            participants: [{username: moderator, role: 'sectionEditor'}],
        });

        // The assignment's box: on the Production stage's Participants
        // panel the Moderator's "Edit Assignment" box arrives ticked on a
        // preprint server: unticked and saved with OK (Rule 2).
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        const managerScreen = new PublicationScreen(managerPage);
        await managerScreen.openProductionStage();
        const editModal = await openEditAssignment(managerPage, moderatorName);
        await expect(editModal.locator('input[name="canChangeMetadata"]')).toBeChecked();
        await editModal.getByRole('link', {name: 'Cancel', exact: true}).click();
        await expect(editModal).toHaveCount(0, {timeout: 30_000});
        await setEditAssignmentPermission(managerPage, moderatorName, false);

        // Control, throughout: the manager, who holds no assignment on the
        // submission, saves on the same page with "Saved" and sees
        // "Change" beside the readout (Rule 2; Actors rows 3, 4).
        await managerScreen.openPage('Title & Abstract');
        await expect(managerScreen.languageReadout()).toContainText('English');
        await expect(managerScreen.changeLanguageButton()).toBeVisible();
        await expect(managerScreen.saveButton()).toBeEnabled();
        await managerScreen.fillRichText('titleAbstract', 'subtitle', 'en', `Subtitle ${tag}`);
        await managerScreen.save();

        // The pages without the permission: the Moderator's "Title &
        // Abstract" has Save present but disabled while the fields still
        // take typing (the scenario's own sentence for [A8]): "The" typed
        // as Prefix is gone after a reload (Rule 10; Actors row 3). The
        // page reads "Current Submission Language: English" with no
        // "Change" after it (Actors row 4; Rule 13a).
        const moderatorPage = await (await asUser(moderator)).newPage();
        await openWorkflow(moderatorPage, PK, submissionId);
        const moderatorScreen = new PublicationScreen(moderatorPage);
        await moderatorScreen.openPage('Title & Abstract');
        const prefix = moderatorScreen.input('titleAbstract', 'prefix', 'en');
        await expect(moderatorScreen.saveButton()).toBeVisible({timeout: 30_000});
        await expect(moderatorScreen.saveButton()).toBeDisabled();
        await expect(prefix).toBeEnabled();
        await prefix.fill('The');
        await expect(prefix).toHaveValue('The');
        await expect(moderatorScreen.languageReadout()).toContainText('English');
        await expect(moderatorScreen.changeLanguageButton()).toHaveCount(0);
        await openWorkflow(moderatorPage, PK, submissionId);
        await moderatorScreen.openPage('Title & Abstract');
        await expect(prefix).toHaveValue('', {timeout: 30_000});
        await expect(moderatorScreen.saveButton()).toBeDisabled();
        await expect(
            moderatorScreen.richTextBody('titleAbstract', 'subtitle', 'en')
        ).toContainText(`Subtitle ${tag}`);

        // The permission granted: the box ticked again and saved (Rule 2).
        await openWorkflow(managerPage, PK, submissionId);
        await managerScreen.openProductionStage();
        await setEditAssignmentPermission(managerPage, moderatorName, true);

        // The pages with the permission: the Moderator's "Title & Abstract"
        // reloaded offers Save; "The" as Prefix saves with "Saved" and is
        // there after a reload (Rule 4; Actors row 3); "Change" now follows
        // the readout (Actors row 4; Rule 13a).
        await openWorkflow(moderatorPage, PK, submissionId);
        await moderatorScreen.openPage('Title & Abstract');
        await expect(moderatorScreen.saveButton()).toBeEnabled({timeout: 30_000});
        await expect(moderatorScreen.languageReadout()).toContainText('English');
        await expect(moderatorScreen.changeLanguageButton()).toBeVisible();
        await prefix.fill('The');
        await moderatorScreen.save();
        await openWorkflow(moderatorPage, PK, submissionId);
        await moderatorScreen.openPage('Title & Abstract');
        await expect(prefix).toHaveValue('The', {timeout: 30_000});
        await expect(moderatorScreen.changeLanguageButton()).toBeVisible();

        // Control, at the end: the manager still saves and still sees
        // "Change"; the Moderator's prefix is what the manager reads.
        await openWorkflow(managerPage, PK, submissionId);
        await managerScreen.openPage('Title & Abstract');
        await expect(managerScreen.input('titleAbstract', 'prefix', 'en')).toHaveValue('The', {
            timeout: 30_000,
        });
        await expect(managerScreen.changeLanguageButton()).toBeVisible();
        await managerScreen.fillRichText('titleAbstract', 'subtitle', 'en', `Subtitle ${tag} again`);
        await managerScreen.save();
    });
});
