// @ts-check
/**
 * @file playwright/tests/U40-publication-metadata.spec.js
 *
 * Publication metadata — OJS suite, one test per canonical COMMON scenario
 * (spec scenarios 1–8) plus the OJS-specific scenario 9. Two scenarios are
 * split: scenario 3's journal-only scheduled leg runs as its own test
 * (S3b), and scenario 6's visibility controls run as S6b.
 * Spec: docs/specs/U40-publication-metadata.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - A1 🐞: no test runs with Plain Language Summary at "Require" — in that
 *   state every other Publication save fails, so the suite never enters it,
 *   and the summary field itself is left unexercised.
 * - A2 🐞 / A3 ❓: the reset-permissions test (S7) asserts only the
 *   published item's rewrite; what the tool writes on unpublished and
 *   declined submissions (the 1970 year included) rides those findings.
 * - A4 🐞: S3 re-ticks the Author's assignment permission after the
 *   unpublish without asserting the pre-state (whether the permission
 *   should have returned by itself is A4's question).
 * - A5 ❓: whether a scheduled article can still change language is not
 *   asserted; S3b reaches the scheduled state through the spec's
 *   "Publication Settings first" seeding route and only checks the edit
 *   lock.
 * - A6 ❓: once an item is published or has two versions, only the
 *   "Change" BUTTON's absence is asserted (S6b) — whether the readout
 *   should also leave the Publication pages is A6's open question.
 * - A8 ❓: read-only pages' fields staying typeable is not asserted; S3
 *   asserts only that nothing typed persists (Rule 10's contract).
 * - A10 ❓ + the dropped cross-submission suggestion claim: no test
 *   asserts that any term suggestion appears, on the same or another
 *   submission.
 * - A11 ❓: everywhere a copyright holder is compared, the test uses an
 *   overridden value or the journal-name default — the automatic
 *   author-string holder (with its "(Author)" role suffix) is never
 *   asserted; S5 checks the locked field's description only up to the
 *   contributor's name.
 * - A12 ❓ (empty custom copyright statement) is not exercised.
 * - A13 🐞: S7's Cancel leg asserts only that nothing was reset, then
 *   reloads the Tools page before the second attempt instead of asserting
 *   the button's stuck-disabled state.
 * - A14 ❓: scenario 6's empty-abstract Confirm refusal is asserted as the
 *   scenario writes it; the field description's "recommended" wording (the
 *   finding itself) is not.
 * - OJS1 🐞: scenario 6's leg on an article published into a not-yet-
 *   published issue (button offered, change always refused) is skipped.
 * - Rule 13's Author-stage-screen readout is asserted only on OJS's own
 *   author view; Site Administrator rows, the assistant stage-access
 *   matrix, and the "no email / no notification" side-effect silence
 *   (no natural in-test positive control; no Mailpit use here) are left
 *   to the spec's evidence. The submission wizard's side of these fields
 *   belongs to U21.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only for settings (S1/S3/S4 touch only their own seeded
 * submissions there; every settings mutation runs on a scratch journal
 * with throwaway users). Waits are event-based (API responses, web-first
 * assertions, jQuery idle for legacy grids) — no hard sleeps. Everything
 * runs in the parallel `ojs` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    PublicationScreen,
    createIssue,
    publishIssue,
    setBackIssueDate,
    waitForContextSettingsSave,
} = require('../pages/PublicationMetadataPages.js');
const {
    EditorialDashboardPage,
} = require('../../../../shared/playwright/pages/EditorialDashboardPage.js');

const JOURNAL = 'publicknowledge';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u40${scenario}w${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
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

/** Open Settings › Workflow › Metadata and wait for its checkboxes. */
async function openMetadataSettings(page, contextPath) {
    await page.goto(`/index.php/${contextPath}/management/settings/workflow`);
    await page.locator('#metadata-button').click();
    await expect(
        page.getByRole('checkbox', {name: 'Enable keyword metadata'})
    ).toBeVisible({timeout: 30_000});
}

/** The Metadata settings form (the one carrying the enable switches). */
function metadataSettingsForm(page) {
    return page
        .locator('form')
        .filter({has: page.getByRole('checkbox', {name: 'Enable keyword metadata'})});
}

/** Save the Metadata settings form, bounded by the context API answering. */
async function saveMetadataSettings(page) {
    const saved = waitForContextSettingsSave(page);
    await metadataSettingsForm(page)
        .getByRole('button', {name: 'Save', exact: true})
        .click();
    await saved;
}

/**
 * Configure Settings › Distribution › License on a scratch journal:
 * optional Copyright Holder radio, license radio, and License Terms text.
 */
async function configureLicenseSettings(page, contextPath, {holder, license, terms} = {}) {
    await page.goto(`/index.php/${contextPath}/management/settings/distribution`);
    await page.locator('#license-button').click();
    const anchor = page.getByRole('radio', {name: 'CC Attribution 4.0', exact: true});
    await expect(anchor).toBeVisible({timeout: 30_000});
    if (holder) {
        await page.getByRole('radio', {name: holder, exact: true}).check();
    }
    if (license) {
        await page.getByRole('radio', {name: license, exact: true}).check();
    }
    if (terms) {
        await page.waitForFunction(
            () => !!window.tinymce?.get('license-licenseTerms-control-en')?.initialized,
            undefined,
            {timeout: 30_000}
        );
        await page.evaluate((value) => {
            const editor = window.tinymce.get('license-licenseTerms-control-en');
            editor.setContent(value);
            editor.fire('change');
        }, terms);
    }
    const saved = waitForContextSettingsSave(page);
    await page
        .locator('form')
        .filter({has: anchor})
        .getByRole('button', {name: 'Save', exact: true})
        .click();
    await saved;
}

test.describe('publication metadata', () => {
    test('S1: edit the title and abstract; an empty title is refused', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        const pub = new PublicationScreen(page, JOURNAL);
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Title & Abstract');

        // The page carries Prefix (with its guidance), Title, Subtitle and
        // Abstract, prefilled with the author's entries.
        await expect(page.getByText('Examples: A, The')).toBeVisible();
        await expect(page.locator('input[name="prefix-en"]')).toBeVisible();
        expect(await pub.richTextContent('titleAbstract-title-control-en')).toBe(
            `Submission ${tag}`
        );
        expect(await pub.richTextContent('titleAbstract-abstract-control-en')).toContain(
            'Seeded abstract'
        );

        // Prefix, subtitle, an italic title (via the "Formatting" menu the
        // one-line editors keep behind focus) and a new abstract; Save.
        await page.locator('input[name="prefix-en"]').fill('The');
        await pub.setRichText('titleAbstract-subtitle-control-en', `Subtitle ${tag}`);
        await pub.applyFormattingCommand('titleAbstract-title-control-en', 'Italic');
        await pub.setRichText(
            'titleAbstract-abstract-control-en',
            `<p>Abstract ${tag} revised</p>`
        );
        await pub.save();

        // Clearing the required Title refuses the save in place: summary,
        // per-field jump buttons and the field message; nothing is sent.
        await pub.setRichText('titleAbstract-title-control-en', '');
        await pub.saveButton().click();
        await expect(page.getByText('Please correct one error.')).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.getByText('This field is required.').first()).toBeVisible();
        await expect(page.getByRole('button', {name: /Go to Title/})).toBeVisible();
        await expect(page.getByRole('button', {name: 'Jump to next error'})).toBeVisible();

        // Restore the (italic) title and save again.
        await pub.setRichText(
            'titleAbstract-title-control-en',
            `<i>Submission ${tag}</i>`
        );
        await pub.save();

        // A reload shows the saved values.
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Title & Abstract');
        await expect(page.locator('input[name="prefix-en"]')).toHaveValue('The');
        expect(await pub.richTextContent('titleAbstract-title-control-en')).toBe(
            `<i>Submission ${tag}</i>`
        );
        expect(await pub.richTextContent('titleAbstract-subtitle-control-en')).toBe(
            `Subtitle ${tag}`
        );
        expect(await pub.richTextContent('titleAbstract-abstract-control-en')).toContain(
            `Abstract ${tag} revised`
        );

        // The Activity Log gained "Submission metadata updated" lines
        // attributed to the saving manager.
        const log = await pub.openActivityLog();
        await expect(
            log
                .getByRole('row')
                .filter({hasText: 'Submission metadata updated'})
                .filter({hasText: 'Maya Manager'})
                .first()
        ).toBeVisible({timeout: 30_000});
        await log.getByRole('button', {name: 'Close', exact: true}).first().click();

        // The dashboard list renders the title with its new prefix.
        const dash = new EditorialDashboardPage(page, JOURNAL);
        await dash.goto();
        await dash.globalSearch(tag);
        await expect(dash.row(tag)).toContainText(`The Submission ${tag}`, {
            timeout: 30_000,
        });
    });

    test('S2: the Metadata page follows the journal\'s metadata setup', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
        });

        const page = await (await asUser(manager)).newPage();
        const pub = new PublicationScreen(page, tag);

        // Disable every Metadata-page item (a fresh journal enables only
        // Keywords; the others are unticked defensively).
        await openMetadataSettings(page, tag);
        for (const name of [
            'Enable keyword metadata',
            'Enable subject metadata',
            'Enable disciplines metadata',
            'Enable supporting agencies metadata',
            'Enable coverage metadata',
            'Enable rights metadata',
            'Enable source metadata',
            'Enable type metadata',
            'Enable funding statement metadata',
        ]) {
            await page.getByRole('checkbox', {name}).uncheck();
        }
        await saveMetadataSettings(page);

        // With nothing enabled the page carries the empty message and no
        // Save button.
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Metadata');
        await expect(
            page.getByText('No metadata fields are currently enabled.')
        ).toBeVisible({timeout: 30_000});
        await expect(pub.saveButton()).toHaveCount(0);

        // Enable Keywords and Coverage: the page shows exactly those two.
        await openMetadataSettings(page, tag);
        await page.getByRole('checkbox', {name: 'Enable keyword metadata'}).check();
        await page.getByRole('checkbox', {name: 'Enable coverage metadata'}).check();
        await saveMetadataSettings(page);

        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Metadata');
        const keywords = page.locator('#metadata-keywords-control-en');
        await expect(keywords).toBeVisible({timeout: 30_000});
        await expect(page.locator('input[name="coverage-en"]')).toBeVisible();
        await expect(page.locator('#metadata-subjects-control-en')).toHaveCount(0);
        await expect(page.locator('input[name="rights-en"]')).toHaveCount(0);
        await expect(page.locator('input[name="source-en"]')).toHaveCount(0);
        await expect(page.locator('input[name="type-en"]')).toHaveCount(0);
        await expect(page.locator('#metadata-fundingStatement-control-en')).toHaveCount(0);

        // Keywords are chips: Enter adds one with its own remove button,
        // the button removes it, and a never-used term is accepted as typed.
        await keywords.click();
        await keywords.pressSequentially('ocean acidification', {delay: 15});
        await keywords.press('Enter');
        const chipRemove = page.getByRole('button', {name: 'Remove ocean acidification'});
        await expect(chipRemove).toBeVisible({timeout: 30_000});
        await chipRemove.click();
        await expect(chipRemove).toHaveCount(0);
        await keywords.click();
        await keywords.pressSequentially('ocean acidification', {delay: 15});
        await keywords.press('Enter');
        await expect(chipRemove).toBeVisible({timeout: 30_000});
        await keywords.pressSequentially(`nova${tag}`, {delay: 15});
        await keywords.press('Enter');
        await expect(
            page.getByRole('button', {name: `Remove nova${tag}`})
        ).toBeVisible({timeout: 30_000});
        await page.locator('input[name="coverage-en"]').fill('Pacific Ocean, 2020');
        await pub.save();

        // Reload: both chips and the coverage value are there.
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Metadata');
        await expect(
            page.getByRole('button', {name: 'Remove ocean acidification'})
        ).toBeVisible({timeout: 30_000});
        await expect(page.getByRole('button', {name: `Remove nova${tag}`})).toBeVisible();
        await expect(page.locator('input[name="coverage-en"]')).toHaveValue(
            'Pacific Ocean, 2020'
        );

        // Disabling Coverage hides the field but keeps the stored value;
        // re-enabling shows it again.
        await openMetadataSettings(page, tag);
        await page.getByRole('checkbox', {name: 'Enable coverage metadata'}).uncheck();
        await saveMetadataSettings(page);
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Metadata');
        await expect(page.locator('#metadata-keywords-control-en')).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.locator('input[name="coverage-en"]')).toHaveCount(0);

        await openMetadataSettings(page, tag);
        await page.getByRole('checkbox', {name: 'Enable coverage metadata'}).check();
        await saveMetadataSettings(page);
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Metadata');
        await expect(page.locator('input[name="coverage-en"]')).toHaveValue(
            'Pacific Ocean, 2020',
            {timeout: 30_000}
        );
    });

    test('S3: the Author before and after publication', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s3', testInfo);
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        const authorPage = await (await asUser('author.alex')).newPage();
        const authorPub = new PublicationScreen(authorPage, JOURNAL);
        const managerPage = await (await asUser('manager.maya')).newPage();
        const managerPub = new PublicationScreen(managerPage, JOURNAL);

        // On a journal the submitting Author's Title & Abstract shows the
        // fields with Save unavailable, and nothing typed persists.
        await authorPub.gotoWorkflow(submissionId, {author: true});
        await authorPub.openEntry('Title & Abstract');
        await expect(authorPage.locator('input[name="prefix-en"]')).toBeVisible();
        await expect(authorPub.saveButton()).toBeDisabled();
        await authorPage.locator('input[name="prefix-en"]').fill('Zzz');
        await authorPub.gotoWorkflow(submissionId, {author: true});
        await authorPub.openEntry('Title & Abstract');
        await expect(authorPage.locator('input[name="prefix-en"]')).toHaveValue('');

        // The author view has no Permissions & Disclosure entry (positive
        // control: the sibling Metadata entry is offered).
        await expect(authorPub.entryLink('Metadata')).toBeVisible();
        await expect(authorPub.entryLink('Permissions & Disclosure')).toHaveCount(0);

        // The Journal Manager publishes (no issue: continuous publication).
        await managerPub.gotoWorkflow(submissionId);
        await managerPub.openEntry('Title & Abstract');
        await managerPub.publish();

        // The published version tells the Author it cannot be edited.
        await authorPub.gotoWorkflow(submissionId, {author: true});
        await authorPub.openEntry('Title & Abstract');
        await expect(
            authorPage.getByText('This version has been published and can not be edited.')
        ).toBeVisible({timeout: 30_000});
        await expect(authorPub.saveButton()).toBeDisabled();

        // Unpublish, then restore the Author's editing through the
        // assignment's permission checkbox (Rule 2; the not-restored
        // pre-state is A4's, not asserted).
        await managerPub.unpublish();
        await managerPub.gotoWorkflow(submissionId);
        await managerPub.allowParticipantMetadataEdit('Alex Author');

        // The Author saves again at once.
        await authorPub.gotoWorkflow(submissionId, {author: true});
        await authorPub.openEntry('Title & Abstract');
        await expect(authorPub.saveButton()).toBeEnabled({timeout: 30_000});
        await authorPage.locator('input[name="prefix-en"]').fill('The');
        await authorPub.save();
        await authorPub.gotoWorkflow(submissionId, {author: true});
        await authorPub.openEntry('Title & Abstract');
        await expect(authorPage.locator('input[name="prefix-en"]')).toHaveValue('The');
    });

    test('S3b: a scheduled article locks the permitted Author out, with no banner', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s3b', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
        });

        const managerPage = await (await asUser(manager)).newPage();
        const managerPub = new PublicationScreen(managerPage, tag);
        const authorPage = await (await asUser(author)).newPage();
        const authorPub = new PublicationScreen(authorPage, tag);

        // Give the Author's assignment the metadata-edit permission — the
        // positive control: they can save while nothing is scheduled.
        await managerPub.gotoWorkflow(submissionId);
        await managerPub.allowParticipantMetadataEdit('Ada Author');
        await authorPub.gotoWorkflow(submissionId, {author: true});
        await authorPub.openEntry('Title & Abstract');
        await expect(authorPub.saveButton()).toBeEnabled({timeout: 30_000});
        await authorPage.locator('input[name="prefix-en"]').fill('A');
        await authorPub.save();

        // Schedule to a future issue through the dependable route (spec
        // seeding note: Publication Settings first, then the panel).
        await createIssue(managerPage, tag, {
            volume: '9',
            number: '9',
            year: '2099',
            title: 'Future issue 2099',
        });
        await managerPub.gotoWorkflow(submissionId);
        await managerPub.scheduleToFutureIssue(/Vol\. 9 No\. 9 \(2099\)/);

        // The Author's page is read-only with no banner at all (Rule 9).
        await authorPub.gotoWorkflow(submissionId, {author: true});
        await authorPub.openEntry('Title & Abstract');
        await expect(authorPage.locator('input[name="prefix-en"]')).toBeVisible({
            timeout: 30_000,
        });
        await expect(authorPub.saveButton()).toBeDisabled();
        await expect(authorPage.getByText('can not be edited')).toHaveCount(0);
        await expect(
            authorPage.getByText('Warning: This version has been published')
        ).toHaveCount(0);
    });

    test('S4: a published version warns the editor and stays editable', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            published: true,
        });

        const managerPage = await (await asUser('manager.maya')).newPage();
        const pub = new PublicationScreen(managerPage, JOURNAL);
        const banner =
            'Warning: This version has been published. Editing it may impact the published content.';

        // The warning banner sits on every Publication page of the
        // published version.
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Title & Abstract');
        await expect(managerPage.getByText(banner)).toBeVisible({timeout: 30_000});
        await pub.openEntry('Metadata');
        await expect(managerPage.getByText(banner)).toBeVisible({timeout: 30_000});
        await pub.openEntry('Permissions & Disclosure');
        await expect(managerPage.getByText(banner)).toBeVisible({timeout: 30_000});

        // The forms stay editable; a save changes what readers see at once.
        // Content-verified edit (the OPS U40 S4 idiom): a late async
        // component refresh can remount the form and revert the editor to
        // the server value after the fill — the save then POSTs the OLD
        // abstract (200 + toast, stale DB). Each bounded attempt redoes
        // fill+save and passes only when the save response's publication
        // JSON holds the new abstract.
        await pub.openEntry('Title & Abstract');
        await expect(async () => {
            await pub.setRichText(
                'titleAbstract-abstract-control-en',
                `<p>Abstract ${tag} after publishing</p>`
            );
            const response = await pub.save();
            const publication = await response.json();
            expect(publication.abstract?.en ?? '').toContain(
                `Abstract ${tag} after publishing`
            );
        }).toPass({intervals: [1_000, 2_000], timeout: 90_000});

        // Anonymous reader (the bare page fixture holds no session).
        await page.goto(`/index.php/${JOURNAL}/article/view/${submissionId}`);
        await expect(
            page.getByText(`Abstract ${tag} after publishing`)
        ).toBeVisible({timeout: 30_000});
    });

    test('S5: copyright and license — defaults, override, publish', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s5', testInfo);
        const controlTag = `${tag}c`;
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
        });

        const managerPage = await (await asUser(manager)).newPage();
        const pub = new PublicationScreen(managerPage, tag);

        // Journal defaults: holder "Author", CC Attribution 4.0, terms.
        await configureLicenseSettings(managerPage, tag, {
            holder: 'Author',
            license: 'CC Attribution 4.0',
            terms: `<p>License terms ${tag}.</p>`,
        });

        // Permissions & Disclosure arrives locked, each field describing
        // the value the journal will apply, with an Override link.
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Permissions & Disclosure');
        const holder = managerPage.locator('input[name="copyrightHolder-en"]');
        const year = managerPage.locator('input[name="copyrightYear"]');
        const licenseUrl = managerPage.locator('input[name="licenseUrl"]');
        await expect(holder).toBeDisabled();
        await expect(year).toBeDisabled();
        await expect(licenseUrl).toBeDisabled();
        // The description names the contributor (its exact author-string
        // shape is A11's — asserted only up to the name).
        await expect(
            managerPage.getByText(/Copyright will be assigned automatically to .*Ada/)
        ).toBeVisible();
        await expect(
            managerPage.getByText(
                'The copyright year will be set automatically when this is published in an issue.'
            )
        ).toBeVisible();
        await expect(
            managerPage.getByText(
                'The license will be set automatically to CC Attribution 4.0 when this is published.'
            )
        ).toBeVisible();
        const overrides = managerPage.getByRole('button', {name: 'Override', exact: true});
        await expect(overrides).toHaveCount(3);

        // Override the holder with a per-item value and save; the field
        // opens unlocked on the next visit.
        await overrides.first().click();
        await expect(holder).toBeEnabled();
        await holder.fill('Example Society');
        await pub.save();
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Permissions & Disclosure');
        await expect(holder).toHaveValue('Example Society', {timeout: 30_000});
        await expect(holder).toBeEnabled();
        await expect(overrides).toHaveCount(2);

        // Publishing fills the still-empty fields from the defaults and
        // never overwrites the override.
        await pub.publish();
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Permissions & Disclosure');
        const currentYear = String(new Date().getFullYear());
        await expect(holder).toHaveValue('Example Society', {timeout: 30_000});
        await expect(year).toHaveValue(currentYear);
        await expect(licenseUrl).toHaveValue(/creativecommons\.org\/licenses\/by\/4\.0/);
        await expect(holder).toBeEnabled();
        await expect(year).toBeEnabled();
        await expect(licenseUrl).toBeEnabled();
        await expect(overrides).toHaveCount(0);

        // The reader's License block: copyright line, Creative Commons
        // badge sentence, and the journal's License Terms.
        await page.goto(`/index.php/${tag}/article/view/${submissionId}`);
        const block = page.locator('.item.copyright');
        await expect(block).toContainText(`Copyright (c) ${currentYear} Example Society`, {
            timeout: 30_000,
        });
        await expect(block).toContainText('This work is licensed under a');
        await expect(block).toContainText(
            'Creative Commons Attribution 4.0 International License'
        );
        await expect(block).toContainText(`License terms ${tag}.`);

        // Control: a journal with no default license and no terms shows no
        // License block on a published item's page.
        const {author: controlAuthor} = await seedJournal(ojsApi, controlTag);
        const control = await ojsApi.createSubmission({
            tag: `${controlTag}s`,
            context: controlTag,
            submitter: controlAuthor,
            title: `Submission ${controlTag}s`,
            published: true,
        });
        await page.goto(`/index.php/${controlTag}/article/view/${control.submissionId}`);
        await expect(
            page.getByRole('heading', {name: `Submission ${controlTag}s`})
        ).toBeVisible({timeout: 30_000});
        await expect(page.locator('.item.copyright')).toHaveCount(0);
    });

    test('S6: change the submission language', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s6', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag, {bilingual: true});
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
        });

        const page = await (await asUser(manager)).newPage();
        const pub = new PublicationScreen(page, tag);

        // Stage screens show the readout without the button; Publication
        // pages add "Change".
        await pub.gotoWorkflow(submissionId);
        await expect(page.getByText('Current Submission Language:')).toBeVisible({
            timeout: 30_000,
        });
        await expect(pub.changeLanguageButton()).toHaveCount(0);
        await pub.openEntry('Title & Abstract');
        await expect(pub.languageReadoutLine()).toContainText('English');
        await expect(pub.changeLanguageButton()).toBeVisible();

        // The panel offers both languages; Cancel changes nothing.
        let dialog = await pub.openChangeLanguagePanel(`Submission ${tag}s`);
        await expect(dialog.getByRole('radio', {name: 'English'})).toBeChecked();
        await expect(dialog.getByRole('radio', {name: 'French (Canada)'})).toBeVisible();
        await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
        await expect(pub.languageReadoutLine()).toContainText('English');

        // Picking the other language reveals the integrity warning with a
        // required Title and — the section requires abstracts — an Abstract
        // box; an empty Abstract refuses the Confirm in place.
        dialog = await pub.openChangeLanguagePanel(`Submission ${tag}s`);
        await dialog.getByRole('radio', {name: 'French (Canada)'}).check();
        await expect(
            dialog.getByText(
                'Before changing the submission language, ensure you have filled out the following metadata fields'
            )
        ).toBeVisible({timeout: 30_000});
        // The revealed boxes settle on the picked language once the panel's
        // per-locale form data lands — gate on the French description.
        await expect(
            dialog.getByText('Enter submission title here in French (Canada)')
        ).toBeVisible({timeout: 30_000});
        await pub.setRichText('changeSubmissionLanguageMetadata-title-control', `Titre ${tag}`);
        await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
        await expect(dialog.getByText('This field is required.').first()).toBeVisible({
            timeout: 30_000,
        });
        await expect(dialog.getByRole('button', {name: 'Confirm', exact: true})).toBeVisible();

        // Filling the abstract lets Confirm through; the screen reloads on
        // Title & Abstract in the new language.
        await pub.setRichText(
            'changeSubmissionLanguageMetadata-abstract-control',
            `<p>Resume ${tag}</p>`
        );
        const changed = page.waitForResponse(
            (r) => r.url().includes('/changeLocale') && r.ok(),
            {timeout: 30_000}
        );
        await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
        await changed;
        await expect(
            page.getByRole('heading', {name: 'Publication: Title & Abstract'})
        ).toBeVisible({timeout: 60_000});
        await expect(pub.languageReadoutLine()).toContainText('French (Canada)', {
            timeout: 30_000,
        });
        expect(await pub.richTextContent('titleAbstract-title-control-fr_CA')).toBe(
            `Titre ${tag}`
        );

        // The old language's title sits behind the form's language bar.
        await page
            .locator('.pkpFormLocales')
            .getByRole('button', {name: 'English'})
            .click();
        await expect(page.getByText('2/2 languages completed').first()).toBeVisible({
            timeout: 30_000,
        });
        expect(await pub.richTextContent('titleAbstract-title-control-en')).toBe(
            `Submission ${tag}s`
        );

        // The contributor's names were copied into the new language.
        await pub.openEntry('Contributors');
        await page.getByRole('button', {name: 'Edit', exact: true}).first().click();
        const contributorPanel = page.getByRole('dialog', {name: /Edit/});
        await expect(
            contributorPanel.locator('input[name="givenName-fr_CA"]')
        ).toHaveValue('Ada', {timeout: 30_000});
    });

    test('S6b: where the language readout and Change are offered', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s6b', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag, {bilingual: true});
        const [plain, published, versioned] = await Promise.all([
            ojsApi.createSubmission({
                tag: `${tag}a`,
                context: tag,
                submitter: author,
                title: `Submission ${tag}a`,
            }),
            ojsApi.createSubmission({
                tag: `${tag}p`,
                context: tag,
                submitter: author,
                title: `Submission ${tag}p`,
                published: true,
            }),
            ojsApi.createSubmission({
                tag: `${tag}v`,
                context: tag,
                submitter: author,
                title: `Submission ${tag}v`,
            }),
        ]);

        const page = await (await asUser(manager)).newPage();
        const pub = new PublicationScreen(page, tag);

        // Positive control: the unpublished single-version submission
        // offers "Change" on a Publication page.
        await pub.gotoWorkflow(plain.submissionId);
        await pub.openEntry('Title & Abstract');
        await expect(pub.changeLanguageButton()).toBeVisible({timeout: 30_000});

        // A published item: the stage screens keep the readout without the
        // button, and no Publication page offers "Change" (the readout's
        // own absence there is A6's question — not asserted). A published
        // item's workflow opens on a Publication page, so the stage check
        // navigates to the Submission stage screen first.
        await pub.gotoWorkflow(published.submissionId);
        await page.getByRole('link', {name: 'Submission', exact: true}).last().click();
        await expect(
            page.getByRole('heading', {name: 'Workflow: Submission'})
        ).toBeVisible({timeout: 30_000});
        await expect(page.getByText('Current Submission Language:')).toBeVisible({
            timeout: 30_000,
        });
        await expect(pub.changeLanguageButton()).toHaveCount(0);
        await pub.openEntry('Title & Abstract');
        await expect(pub.saveButton()).toBeVisible({timeout: 30_000});
        await expect(pub.changeLanguageButton()).toHaveCount(0);

        // A second version removes "Change" too.
        await pub.gotoWorkflow(versioned.submissionId);
        await pub.openEntry('Title & Abstract');
        await expect(pub.changeLanguageButton()).toBeVisible({timeout: 30_000});
        await page.getByRole('link', {name: 'Create New Version', exact: true}).click();
        const versionDialog = page
            .getByRole('dialog')
            .filter({hasText: 'Which version should metadata be copied from?'});
        await expect(
            versionDialog.getByRole('button', {name: 'Confirm', exact: true})
        ).toBeVisible({timeout: 30_000});
        await versionDialog.locator('select[name="versionStage"]').selectOption('VoR');
        await versionDialog.locator('select[name="versionIsMinor"]').selectOption('false');
        await versionDialog.getByRole('button', {name: 'Confirm', exact: true}).click();
        await expect(versionDialog).toHaveCount(0, {timeout: 30_000});
        await pub.gotoWorkflow(versioned.submissionId);
        await pub.openEntry('Title & Abstract');
        await expect(pub.saveButton()).toBeVisible({timeout: 30_000});
        await expect(pub.changeLanguageButton()).toHaveCount(0);

        // The Author never gets the button: their stage screen shows the
        // readout, their Publication pages neither readout nor button.
        const authorPage = await (await asUser(author)).newPage();
        const authorPub = new PublicationScreen(authorPage, tag);
        await authorPub.gotoWorkflow(plain.submissionId, {author: true});
        await expect(authorPage.getByText('Current Submission Language:')).toBeVisible({
            timeout: 30_000,
        });
        await authorPub.openEntry('Title & Abstract');
        await expect(authorPage.locator('input[name="prefix-en"]')).toBeVisible({
            timeout: 30_000,
        });
        await expect(authorPage.getByText('Current Submission Language:')).toHaveCount(0);
        await expect(authorPub.changeLanguageButton()).toHaveCount(0);
    });

    test('S7: reset every article\'s permissions', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s7', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);

        const managerPage = await (await asUser(manager)).newPage();
        const pub = new PublicationScreen(managerPage, tag);

        // Journal defaults: a CC license and terms; no holder chosen, so
        // the default holder is the journal's name (keeps A11 out).
        await configureLicenseSettings(managerPage, tag, {
            license: 'CC Attribution 4.0',
            terms: `<p>License terms ${tag}.</p>`,
        });

        // A published item (fields filled at publish) whose holder is then
        // overridden per-item.
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
            published: true,
        });
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Permissions & Disclosure');
        const holder = managerPage.locator('input[name="copyrightHolder-en"]');
        await expect(holder).toBeEnabled({timeout: 30_000});
        await holder.fill('Example Society');
        await pub.save();
        const currentYear = String(new Date().getFullYear());
        await page.goto(`/index.php/${tag}/article/view/${submissionId}`);
        await expect(page.locator('.item.copyright')).toContainText(
            `Copyright (c) ${currentYear} Example Society`,
            {timeout: 30_000}
        );

        // Tools › Permissions. Cancelling the browser's confirm box resets
        // nothing (the button staying greyed afterwards is A13's — the test
        // reloads instead of asserting it).
        const openPermissionsTools = async () => {
            await managerPage.goto(`/index.php/${tag}/management/tools`);
            await managerPage
                .getByRole('tab', {name: 'Permissions'})
                .or(managerPage.getByRole('link', {name: 'Permissions'}))
                .first()
                .click();
            await expect(
                managerPage.getByRole('button', {name: 'Reset Article Permissions'})
            ).toBeVisible({timeout: 30_000});
        };
        await openPermissionsTools();
        const confirmText =
            'Are you sure you wish to reset permissions data for all articles? This action can not be undone.';
        let confirmMessage = '';
        managerPage.once('dialog', async (dialog) => {
            confirmMessage = dialog.message();
            await dialog.dismiss();
        });
        await managerPage
            .getByRole('button', {name: 'Reset Article Permissions'})
            .click();
        await expect.poll(() => confirmMessage, {timeout: 30_000}).toBe(confirmText);
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Permissions & Disclosure');
        await expect(holder).toHaveValue('Example Society', {timeout: 30_000});

        // OK resets: the toast appears, the override is gone in favor of
        // the journal's default holder, and the reader's line follows.
        await openPermissionsTools();
        managerPage.once('dialog', (dialog) => dialog.accept());
        const reset = managerPage.waitForResponse(
            (r) => r.url().includes('resetPermissions') && r.ok(),
            {timeout: 30_000}
        );
        await managerPage
            .getByRole('button', {name: 'Reset Article Permissions'})
            .click();
        await reset;
        await expect(
            managerPage.getByText('Article permissions were successfully reset.')
        ).toBeVisible({timeout: 30_000});

        const journalName = `Scratch context ${tag}`;
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Permissions & Disclosure');
        await expect(holder).toHaveValue(journalName, {timeout: 30_000});
        await page.goto(`/index.php/${tag}/article/view/${submissionId}`);
        await expect(page.locator('.item.copyright')).toContainText(
            `Copyright (c) ${currentYear} ${journalName}`,
            {timeout: 30_000}
        );
    });

    test('S8: statements reach the reader', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(240_000);
        const tag = makeTag('s8', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
            published: true,
        });

        const managerPage = await (await asUser(manager)).newPage();
        const pub = new PublicationScreen(managerPage, tag);
        const articleUrl = `/index.php/${tag}/article/view/${submissionId}`;

        // Before any statement exists the landing page shows neither block.
        await page.goto(articleUrl);
        await expect(
            page.getByRole('heading', {name: `Submission ${tag}s`})
        ).toBeVisible({timeout: 30_000});
        await expect(page.locator('.item.dataAvailability')).toHaveCount(0);
        await expect(page.locator('.item.fundingStatement')).toHaveCount(0);

        // Enable both statements; the Publication area gains a "Data" entry
        // (after References, before Funding).
        await openMetadataSettings(managerPage, tag);
        await managerPage
            .getByRole('checkbox', {name: 'Enable data availability statement metadata'})
            .check();
        await managerPage
            .getByRole('checkbox', {name: 'Enable funding statement metadata'})
            .check();
        await saveMetadataSettings(managerPage);

        await pub.gotoWorkflow(submissionId);
        await expect(pub.entryLink('Data')).toBeVisible({timeout: 30_000});
        const navNames = await managerPage.getByRole('link').allInnerTexts();
        expect(navNames.indexOf('References')).toBeLessThan(navNames.indexOf('Data'));
        expect(navNames.indexOf('Data')).toBeLessThan(navNames.indexOf('Funding'));

        // Fill both statements (the published version stays editable).
        await pub.openEntry('Data');
        await expect(
            managerPage.getByText('Data Availability Statement', {exact: true})
        ).toBeVisible({timeout: 30_000});
        await pub.setRichText(
            'dataAvailability-dataAvailability-control-en',
            `<p>Data statement ${tag}.</p>`
        );
        await pub.save();
        await pub.openEntry('Metadata');
        await pub.setRichText(
            'metadata-fundingStatement-control-en',
            `<p>Funding statement ${tag}.</p>`
        );
        await pub.save();

        // The landing page shows both blocks, Data Availability first.
        await page.goto(articleUrl);
        await expect(page.locator('.item.dataAvailability')).toContainText(
            `Data statement ${tag}.`,
            {timeout: 30_000}
        );
        await expect(page.locator('.item.dataAvailability')).toContainText(
            'Data Availability Statement'
        );
        await expect(page.locator('.item.fundingStatement')).toContainText(
            `Funding statement ${tag}.`
        );
        await expect(page.locator('.item.fundingStatement')).toContainText(
            'Funding Statement'
        );
        await expect(
            page.locator('.item.dataAvailability, .item.fundingStatement').first()
        ).toContainText('Data Availability Statement');

        // Disabling the statement removes the "Data" entry (data citations
        // are off on a fresh journal) while readers keep the statement.
        await openMetadataSettings(managerPage, tag);
        await managerPage
            .getByRole('checkbox', {name: 'Enable data availability statement metadata'})
            .uncheck();
        await saveMetadataSettings(managerPage);
        await pub.gotoWorkflow(submissionId);
        await expect(pub.entryLink('Title & Abstract')).toBeVisible({timeout: 30_000});
        await expect(pub.entryLink('Data')).toHaveCount(0);
        await page.goto(articleUrl);
        await expect(page.locator('.item.dataAvailability')).toContainText(
            `Data statement ${tag}.`,
            {timeout: 30_000}
        );
    });

    test('S9: copyright year from the issue\'s publication date', async ({asUser, ojsApi, page}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s9', testInfo);
        const {manager, author} = await seedJournal(ojsApi, tag);
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
        });

        const managerPage = await (await asUser(manager)).newPage();
        const pub = new PublicationScreen(managerPage, tag);

        // A default license so the reader's page carries a copyright line;
        // a fresh journal already uses the issue's publication date as the
        // Copyright Year basis.
        await configureLicenseSettings(managerPage, tag, {
            license: 'CC Attribution 4.0',
        });

        // A back issue published last year: create it, publish it, then set
        // its date (the spec's seeding note: publishing an issue stamps
        // today, so the date is set afterwards).
        await createIssue(managerPage, tag, {
            volume: '2',
            number: '1',
            year: '2025',
            title: 'Back issue 2025',
        });
        await publishIssue(managerPage, 'Vol. 2 No. 1 (2025)');
        await setBackIssueDate(managerPage, 'Vol. 2 No. 1 (2025)', {
            year: '2025',
            monthIndex: '5',
            day: '15',
        });
        await managerPage.goto(`/index.php/${tag}/issue/current`);
        await expect(managerPage.getByText('Published: 2025-06-15')).toBeVisible({
            timeout: 30_000,
        });

        // Publish the article into that back issue.
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Title & Abstract');
        await pub.publish({backIssueLabel: /Vol\. 2 No\. 1 \(2025\)/});

        // Copyright Year is the issue's year, not this year, and the
        // reader's line agrees.
        await pub.gotoWorkflow(submissionId);
        await pub.openEntry('Permissions & Disclosure');
        await expect(
            managerPage.locator('input[name="copyrightYear"]')
        ).toHaveValue('2025', {timeout: 30_000});
        await page.goto(`/index.php/${tag}/article/view/${submissionId}`);
        await expect(page.locator('.item.copyright')).toContainText(
            'Copyright (c) 2025',
            {timeout: 30_000}
        );
    });
});
