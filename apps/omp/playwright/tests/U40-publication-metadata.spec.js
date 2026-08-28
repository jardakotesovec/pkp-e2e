// @ts-check
/**
 * @file playwright/tests/U40-publication-metadata.spec.js
 *
 * Publication metadata — OMP suite: one test per canonical COMMON scenario
 * as a press runs it (spec scenarios 1–8, in OMP vocabulary: press, press
 * manager, monograph, catalog book page, series not sections) plus the
 * OMP-specific scenario 10 (chapter licensing on an Edited Volume). The
 * press markers ride inside the common tests: no abstract policy or word
 * counter (OMP2 ✅, in S1), the copyright line printed outside the License
 * block on the book page (OMP1 ✅, in S5/S7), the language-change panel
 * asking for the title only (Rule 13b's press leg, in S6), and the
 * Edited Volume vs Monograph difference (OMP4 ✅, in S10).
 * Spec: docs/specs/U40-publication-metadata.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - A1 🐞 (a required Plain Language Summary blocks every other page's
 *   save): never asserted, and no test runs with the summary at "Require" —
 *   scratch presses stay at the fresh-context default (off), per the spec's
 *   own scenario seeding notes.
 * - A4 🐞 (the author's edit permission never returns after an unpublish):
 *   S3 follows the spec scenario's route — after the unpublish the manager
 *   re-ticks "Allow this person to make changes to the publication…" and
 *   the author's saving is asserted AFTER the re-tick; the intermediate
 *   still-locked state is not asserted either way.
 * - A13 🐞 (Cancel leaves the reset button greyed): S7's Cancel leg asserts
 *   only that nothing was reset, then reloads the page before pressing
 *   again — the button's (broken) state is never asserted.
 * - A2 🐞 is OJS/OPS-only (a press stamps the current year); the press's
 *   year is asserted in S7 only for the published item, because the tool's
 *   reach into unpublished/declined submissions is the open question A3 ❓
 *   — neither the reach nor its per-item log lines are asserted.
 * - OMP5 🐞 (a "License" link that leads nowhere with terms but no
 *   license): the terms-without-license state is never built.
 * - OMP3 ❓ (the press's older reset wording): S7 accepts/dismisses the
 *   native confirm without asserting its text.
 * - A8 ❓ (read-only pages keep fields typeable): read-only views assert
 *   the disabled Save button only — nothing types into a read-only field.
 * - A5/A6 ❓ (scheduled-state language change; the vanished readout's
 *   intent), A10 ❓ (term suggestions — S2 types terms and never asserts a
 *   suggestion), A11 ❓ (the "(Author)" role suffix in the automatic
 *   holder — S5 matches the contributor's name, not the full string),
 *   A12 ❓ (empty custom copyright statement — the option is never chosen),
 *   A14 ❓ (journal/preprint-only: a press's language panel has no Abstract
 *   box) are open questions, not coverage gaps.
 * - The two-version control of scenario 6 ("Create New Version" then no
 *   readout): version creation is *Publish, schedule & versions*' surface;
 *   S6 exercises the published-item control, which trips the same guard.
 * - Side-effect silence ("no email or notification is sent"): a
 *   mail-silence claim with no natural in-test positive control; not
 *   asserted (no Mailpit use in this suite).
 * - Keywords/abstract/summary display on the book page belongs to *Catalog
 *   book page*; S4 asserts the edited abstract there only because the
 *   scenario's point is that an editor's save reaches readers at once.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only (settings mutations run on scratch presses with throwaway
 * users; publicknowledge tests only add their own tagged submissions, per
 * PRINCIPLES A1). Waits are event-based (publication/context API
 * responses, the form footer's "Saved" status, web-first assertions) — no
 * hard-coded sleeps. Everything runs in the parallel `omp` project.
 */
const {test, expect} = require('../support/fixtures.js');

const PK = 'publicknowledge';
const PK_PREFIX = '/en';
const CC_BY = 'https://creativecommons.org/licenses/by/4.0';
const CC_BY_SA = 'https://creativecommons.org/licenses/by-sa/4.0';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u40omp${scenario}w${testInfo.parallelIndex}${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}

/**
 * Open a monograph's workflow view (editorial or author dashboard) and wait
 * for the Publication group to render.
 */
async function openWorkflow(page, contextPath, submissionId, {author = false} = {}) {
    const dashboard = author ? 'mySubmissions' : 'editorial';
    await page.goto(
        `/index.php/${contextPath}/dashboard/${dashboard}?workflowSubmissionId=${submissionId}`
    );
    await expect(
        page.getByRole('link', {name: 'Publication', exact: true})
    ).toBeVisible({timeout: 30_000});
}

/**
 * From an open workflow view, open one of the Publication group's pages and
 * wait for its "Publication: {entry}" heading. The group is expanded by
 * default — clicking "Publication" would collapse it, so it is only clicked
 * when the entry is hidden.
 */
async function openPublicationPage(page, entry) {
    const link = page.getByRole('link', {name: entry, exact: true});
    if (!(await link.isVisible())) {
        await page.getByRole('link', {name: 'Publication', exact: true}).click();
    }
    await link.click();
    await expect(
        page.getByRole('heading', {name: `Publication: ${entry}`})
    ).toBeVisible({timeout: 30_000});
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

/** The publication form's Save button (the only page-level Save). */
function saveButton(page) {
    return page.getByRole('button', {name: 'Save', exact: true});
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
    await saveButton(page).click();
    await saved;
    await expect(
        page.locator('.pkpFormPage__status', {hasText: 'Saved'})
    ).toBeVisible({timeout: 30_000});
}

/** Open Settings › Workflow › Metadata on a scratch press. */
async function openMetadataSettings(page, contextPath) {
    await page.goto(`/index.php/${contextPath}/management/settings/workflow`);
    await page.locator('#metadata-button').click();
    await expect(
        page.getByRole('checkbox', {name: 'Enable keyword metadata'})
    ).toBeVisible({timeout: 30_000});
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

/** The metadata settings form (scoped by a checkbox it always carries). */
function metadataSettingsForm(page) {
    return page
        .locator('form')
        .filter({has: page.getByRole('checkbox', {name: 'Enable keyword metadata'})});
}

/**
 * Set the press's Settings › Distribution › License form: copyright holder
 * radio, license radio, and optionally License Terms.
 */
async function setLicenseSettings(page, contextPath, {holder, license, terms} = {}) {
    await page.goto(`/index.php/${contextPath}/management/settings/distribution`);
    await page.locator('#license-button').click();
    const form = page.locator('form').filter({
        has: page.getByRole('radio', {name: 'CC Attribution 4.0', exact: true}),
    });
    await expect(form).toBeVisible({timeout: 30_000});
    if (holder) {
        await form.getByRole('radio', {name: holder, exact: true}).check();
    }
    if (license) {
        await form.getByRole('radio', {name: license, exact: true}).check();
    }
    if (terms) {
        const termsBody = form.frameLocator('iframe').first().locator('body');
        await termsBody.click();
        await termsBody.fill(terms);
    }
    await saveSettingsForm(page, form);
}

/**
 * Publish the open workflow's current publication through the "Publish"
 * header action and its "Schedule For Publication" modal; resolved when the
 * workflow shows the published state (Unpublish offered).
 */
async function publishFromWorkflow(page) {
    await page.getByRole('button', {name: 'Publish', exact: true}).click();
    const modal = page.getByRole('dialog', {name: /Schedule For Publication/});
    await expect(modal).toBeVisible({timeout: 30_000});
    const published = page.waitForResponse(
        (r) => r.url().includes('/publish') && r.ok(),
        {timeout: 30_000}
    );
    await modal.getByRole('button', {name: 'Publish', exact: true}).click();
    await published;
    await expect(
        page.getByRole('button', {name: 'Unpublish', exact: true})
    ).toBeVisible({timeout: 30_000});
}

/** Unpublish the open workflow's current publication (confirm dialog). */
async function unpublishFromWorkflow(page) {
    await page.getByRole('button', {name: 'Unpublish', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Unpublish'});
    await expect(dialog).toBeVisible({timeout: 30_000});
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

/** The catalog book page URL (publicknowledge is bilingual → /en prefix). */
function bookUrl(contextPath, submissionId) {
    const prefix = contextPath === PK ? PK_PREFIX : '';
    return `/index.php/${contextPath}${prefix}/catalog/book/${submissionId}`;
}

test.describe('Publication metadata (U40)', () => {
    test('S1: edit the title and abstract (press: no abstract policy)', {tag: '@smoke'}, async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        await openWorkflow(page, PK, submissionId);
        await openPublicationPage(page, 'Title & Abstract');

        // The page's fixed furniture: Prefix with its guidance, Title,
        // Subtitle, Abstract prefilled with the seeded value.
        await expect(page.getByText('Examples: A, The')).toBeVisible();
        await expect(field(page, /^Prefix/)).toBeVisible();
        await expect(field(page, /^Subtitle/)).toBeVisible();
        await expect(richBody(page, /^Title\b/)).toContainText(`Submission ${tag}`);

        // Fill prefix and subtitle.
        await field(page, /^Prefix/).locator('input').first().fill('The');
        const subtitleBody = richBody(page, /^Subtitle/);
        await subtitleBody.click();
        await subtitleBody.fill(`Sub ${tag}`);

        // Change the abstract to a 40-word text: a press shows no word
        // counter and applies no limit or requirement (OMP2).
        const abstractText = Array.from({length: 40}, (_, i) => `word${i}`).join(' ');
        const abstractBody = richBody(page, /^Abstract/);
        await abstractBody.click();
        await abstractBody.fill(abstractText);
        await expect(field(page, /^Abstract/).getByText(/Word Count:/)).toHaveCount(0);
        await savePublicationForm(page);

        // Clearing the Title is refused in the browser: summary + field
        // message, nothing saved.
        const titleBody = richBody(page, /^Title\b/);
        await titleBody.click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('Delete');
        await saveButton(page).click();
        await expect(page.getByText('Please correct one error.')).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.getByText('This field is required.').first()).toBeVisible();
        await titleBody.click();
        await titleBody.fill(`Submission ${tag}`);

        // Italicize the whole title through the "Formatting" menu that
        // appears once the editor has focus (its options portal to the
        // document root as a toolbar carrying Underline, unlike the
        // Abstract's own toolbar).
        await page.keyboard.press('ControlOrMeta+a');
        await page.getByRole('button', {name: 'Formatting'}).click();
        const formatMenu = page
            .locator('[role="toolbar"]')
            .filter({has: page.getByRole('button', {name: 'Underline', exact: true})});
        await formatMenu.getByRole('button', {name: 'Italic', exact: true}).click();
        await savePublicationForm(page);

        // A reload shows the saved values; the title's italics survived.
        await openWorkflow(page, PK, submissionId);
        await openPublicationPage(page, 'Title & Abstract');
        await expect(field(page, /^Prefix/).locator('input').first()).toHaveValue('The');
        await expect(richBody(page, /^Subtitle/)).toContainText(`Sub ${tag}`);
        await expect(richBody(page, /^Abstract/)).toContainText('word39');
        await expect(richBody(page, /^Title\b/).locator('i')).toContainText(
            `Submission ${tag}`
        );

        // A press's abstract is optional: emptied, the form still saves
        // (OMP2 — no "This field is required." for the abstract).
        const abstractBody2 = richBody(page, /^Abstract/);
        await abstractBody2.click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('Delete');
        await savePublicationForm(page);

        // The dashboard list renders the full title with the prefix (the
        // side-nav global search flips to the cross-status Search Results
        // view; search commits on Enter only).
        await page.goto(`/index.php/${PK}/dashboard/editorial`);
        const search = page
            .getByRole('navigation', {name: 'Site Navigation'})
            .getByRole('searchbox')
            .first();
        await search.fill(tag);
        await search.press('Enter');
        await expect(page.getByText(`The Submission ${tag}`).first()).toBeVisible({
            timeout: 30_000,
        });

        // Every successful save logged "Submission metadata updated".
        await openWorkflow(page, PK, submissionId);
        await page.getByRole('button', {name: 'Activity Log', exact: true}).click();
        const log = page.getByRole('dialog', {name: /Activity Log/});
        await expect(log.getByText('Submission metadata updated').first()).toBeVisible({
            timeout: 30_000,
        });
    });

    test('S2: the Metadata page mirrors the press\'s metadata setup', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        await ompApi.createContext({
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
            ],
        });
        const {submissionId} = await ompApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
        });

        const page = await (await asUser(`${tag}mg`)).newPage();

        // Untick every enabled "Enable … metadata" box (a fresh press has
        // keywords on by default) and save.
        await openMetadataSettings(page, tag);
        const form = metadataSettingsForm(page);
        const checkedBoxes = form.locator('input[type="checkbox"]:checked');
        for (let i = 0; (await checkedBoxes.count()) > 0 && i < 25; i++) {
            await checkedBoxes.first().uncheck();
        }
        await expect(checkedBoxes).toHaveCount(0);
        await saveSettingsForm(page, form);

        // With nothing enabled the Metadata page is the empty message with
        // no Save button.
        await openWorkflow(page, tag, submissionId);
        await openPublicationPage(page, 'Metadata');
        await expect(
            page.getByText('No metadata fields are currently enabled.')
        ).toBeVisible();
        await expect(saveButton(page)).toHaveCount(0);

        // Enable Keywords and Coverage: the page shows exactly those.
        await openMetadataSettings(page, tag);
        await form.getByRole('checkbox', {name: 'Enable keyword metadata'}).check();
        await form.getByRole('checkbox', {name: 'Enable coverage metadata'}).check();
        await saveSettingsForm(page, form);

        await openWorkflow(page, tag, submissionId);
        await openPublicationPage(page, 'Metadata');
        await expect(field(page, /^Keywords/)).toBeVisible();
        await expect(field(page, /^Coverage/)).toBeVisible();
        await expect(field(page, /^Subjects/)).toHaveCount(0);
        await expect(field(page, /^Source/)).toHaveCount(0);

        // Keywords are chips: Enter adds, "Remove {term}" removes; a term
        // nobody used before is accepted as typed.
        const keywordInput = field(page, /^Keywords/)
            .locator('input.pkpAutosuggest__input')
            .first();
        await keywordInput.click();
        await keywordInput.fill('ocean acidification');
        await keywordInput.press('Enter');
        const removeChip = page.getByRole('button', {name: 'Remove ocean acidification'});
        await expect(removeChip).toBeVisible();
        await removeChip.click();
        await expect(removeChip).toHaveCount(0);
        await keywordInput.fill('ocean acidification');
        await keywordInput.press('Enter');
        await keywordInput.fill(`term${tag}`);
        await keywordInput.press('Enter');
        await expect(page.getByRole('button', {name: `Remove term${tag}`})).toBeVisible();
        await field(page, /^Coverage/).locator('input').first().fill('Pacific Ocean, 2020');
        await savePublicationForm(page);

        // Reload: both chips and the coverage value are there.
        await openWorkflow(page, tag, submissionId);
        await openPublicationPage(page, 'Metadata');
        await expect(
            page.getByRole('button', {name: 'Remove ocean acidification'})
        ).toBeVisible({timeout: 30_000});
        await expect(page.getByRole('button', {name: `Remove term${tag}`})).toBeVisible();
        await expect(field(page, /^Coverage/).locator('input').first()).toHaveValue(
            'Pacific Ocean, 2020'
        );

        // Disabling Coverage hides the field but keeps the value; on
        // re-enabling, the stored value is back.
        await openMetadataSettings(page, tag);
        await form.getByRole('checkbox', {name: 'Enable coverage metadata'}).uncheck();
        await saveSettingsForm(page, form);
        await openWorkflow(page, tag, submissionId);
        await openPublicationPage(page, 'Metadata');
        await expect(field(page, /^Keywords/)).toBeVisible();
        await expect(field(page, /^Coverage/)).toHaveCount(0);

        await openMetadataSettings(page, tag);
        await form.getByRole('checkbox', {name: 'Enable coverage metadata'}).check();
        await saveSettingsForm(page, form);
        await openWorkflow(page, tag, submissionId);
        await openPublicationPage(page, 'Metadata');
        await expect(field(page, /^Coverage/).locator('input').first()).toHaveValue(
            'Pacific Ocean, 2020',
            {timeout: 30_000}
        );
    });

    test('S3: the press author before and after publication', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
        });

        // On a press the author's page is read-only from submission on:
        // the fields render, Save is unavailable.
        const authorPage = await (await asUser('author.alex')).newPage();
        await openWorkflow(authorPage, PK, submissionId, {author: true});
        await openPublicationPage(authorPage, 'Title & Abstract');
        await expect(richBody(authorPage, /^Title\b/)).toContainText(`Submission ${tag}`);
        await expect(saveButton(authorPage)).toBeDisabled();

        // The press manager publishes the monograph (the Publish control
        // sits on the Publication pages).
        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        await openPublicationPage(managerPage, 'Title & Abstract');
        await publishFromWorkflow(managerPage);

        // The author now sees the published-version banner, Save still
        // unavailable.
        await openWorkflow(authorPage, PK, submissionId, {author: true});
        await openPublicationPage(authorPage, 'Title & Abstract');
        await expect(
            authorPage.getByText('This version has been published and can not be edited.')
        ).toBeVisible();
        await expect(saveButton(authorPage)).toBeDisabled();

        // The manager unpublishes, then re-ticks "Allow this person to
        // make changes to the publication…" on the author's assignment
        // (the spec scenario's route back to an editable page — the
        // intermediate locked state of A4 is not asserted either way).
        await unpublishFromWorkflow(managerPage);
        await managerPage.getByRole('link', {name: 'Production', exact: true}).click();
        await managerPage
            .getByRole('button', {name: /Alex Author More Actions/})
            .click();
        await managerPage.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const editAssignment = managerPage.getByRole('dialog', {name: 'Edit Assignment'});
        await expect(editAssignment).toBeVisible({timeout: 30_000});
        const permissionBox = editAssignment.getByRole('checkbox', {
            name: /Allow this person to make changes to the publication/,
        });
        if (!(await permissionBox.isChecked())) {
            await permissionBox.check();
        }
        await editAssignment.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(editAssignment).toHaveCount(0, {timeout: 30_000});

        // The author's Save works again and the edit persists.
        await openWorkflow(authorPage, PK, submissionId, {author: true});
        await openPublicationPage(authorPage, 'Title & Abstract');
        await expect(saveButton(authorPage)).toBeEnabled({timeout: 30_000});
        const subtitleBody = richBody(authorPage, /^Subtitle/);
        await subtitleBody.click();
        await subtitleBody.fill(`AuthorSub ${tag}`);
        await savePublicationForm(authorPage);
        await openWorkflow(authorPage, PK, submissionId, {author: true});
        await openPublicationPage(authorPage, 'Title & Abstract');
        await expect(richBody(authorPage, /^Subtitle/)).toContainText(`AuthorSub ${tag}`);
    });

    test('S4: editing a published version warns and reaches readers', async ({asUser, ompApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            published: true,
        });
        const newAbstract = `Edited abstract ${tag}`;

        const managerPage = await (await asUser('manager.maya')).newPage();
        await openWorkflow(managerPage, PK, submissionId);
        await openPublicationPage(managerPage, 'Title & Abstract');
        const warning =
            'Warning: This version has been published. Editing it may impact the published content.';
        await expect(managerPage.getByText(warning)).toBeVisible();

        // The same banner on another Publication page.
        await openPublicationPage(managerPage, 'Metadata');
        await expect(managerPage.getByText(warning)).toBeVisible();

        // The form stays editable; a save changes what readers see at once.
        await openPublicationPage(managerPage, 'Title & Abstract');
        const abstractBody = richBody(managerPage, /^Abstract/);
        await abstractBody.click();
        await abstractBody.fill(newAbstract);
        // Commit the editor content to the form model before Save (TinyMCE
        // syncs v-model on change, reliably fired on blur) — without it a
        // racing Save can persist the OLD abstract: 200 + toast, stale DB
        // (the mechanism behind the OPS U40 S4 gate reds).
        await abstractBody.blur();
        await savePublicationForm(managerPage);

        await page.goto(bookUrl(PK, submissionId));
        await expect(page.getByText(newAbstract)).toBeVisible({timeout: 30_000});
    });

    test('S5: copyright and license — defaults, override, publish, book page', async ({asUser, ompApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const controlTag = `${tag}c`;
        const year = String(new Date().getFullYear());

        // Press A: holder "Author", CC BY 4.0, license terms. Press B
        // (control): fresh defaults — no holder, no license, no terms.
        await Promise.all([
            ompApi.createContext({
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
                        givenName: 'Alice',
                        familyName: 'Probe',
                        email: `${tag}au@mail.test`,
                        roles: ['author'],
                    },
                ],
            }),
            ompApi.createContext({
                tag: controlTag,
                users: [
                    {
                        username: `${controlTag}au`,
                        givenName: 'Ada',
                        familyName: 'Author',
                        email: `${controlTag}au@mail.test`,
                        roles: ['author'],
                    },
                ],
            }),
        ]);
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await setLicenseSettings(managerPage, tag, {
            holder: 'Author',
            license: 'CC Attribution 4.0',
            terms: `Terms paragraph ${tag}.`,
        });
        const [{submissionId}, control] = await Promise.all([
            ompApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: `${tag}au`,
                title: `Submission ${tag}`,
                decisions: ['skipExternalReview', 'sendToProduction'],
            }),
            ompApi.createSubmission({
                tag: `${controlTag}s`,
                context: controlTag,
                submitter: `${controlTag}au`,
                title: `Submission ${controlTag}`,
                decisions: ['skipExternalReview', 'sendToProduction'],
                published: true,
            }),
        ]);

        // Permissions & Disclosure before publishing: the three fields
        // arrive locked with an Override each, their descriptions naming
        // the values the press will apply.
        await openWorkflow(managerPage, tag, submissionId);
        await openPublicationPage(managerPage, 'Permissions & Disclosure');
        const holderField = field(managerPage, /^Copyright Holder/);
        const yearField = field(managerPage, /^Copyright Year/);
        const licenseField = field(managerPage, /^License URL/);
        await expect(holderField.locator('input').first()).toBeDisabled();
        await expect(holderField.getByRole('button', {name: 'Override'})).toBeVisible();
        await expect(
            holderField.getByText(/Copyright will be assigned automatically to .*Alice Probe/)
        ).toBeVisible();
        await expect(yearField.locator('input').first()).toBeDisabled();
        await expect(
            yearField.getByText(
                'The copyright year will be set automatically based on the publication date.'
            )
        ).toBeVisible();
        await expect(licenseField.locator('input').first()).toBeDisabled();
        await expect(
            licenseField.getByText(
                'The license will be set automatically to CC Attribution 4.0 when this is published.'
            )
        ).toBeVisible();

        // Override the holder and save.
        await holderField.getByRole('button', {name: 'Override'}).click();
        await holderField.locator('input').first().fill('Example Society');
        await savePublicationForm(managerPage);

        // Publish; the empty fields fill from the defaults, the override
        // survives, everything is unlocked.
        await publishFromWorkflow(managerPage);
        await openWorkflow(managerPage, tag, submissionId);
        await openPublicationPage(managerPage, 'Permissions & Disclosure');
        await expect(holderField.locator('input').first()).toHaveValue('Example Society');
        await expect(holderField.locator('input').first()).toBeEnabled();
        await expect(holderField.getByRole('button', {name: 'Override'})).toHaveCount(0);
        await expect(yearField.locator('input').first()).toHaveValue(year);
        await expect(licenseField.locator('input').first()).toHaveValue(CC_BY);

        // The book page prints the copyright line as its own line (OMP1)
        // and the License block with the CC badge sentence and the terms.
        await page.goto(bookUrl(tag, submissionId));
        await expect(page.locator('.item.copyright')).toContainText(
            `Copyright (c) ${year} Example Society`
        );
        const licenseBlock = page.locator('.item.license');
        await expect(licenseBlock).toContainText(
            'This work is licensed under a Creative Commons Attribution 4.0 International License.'
        );
        await expect(licenseBlock).toContainText(`Terms paragraph ${tag}.`);

        // Control: no default license and no terms → no License block at
        // all; the press still prints its copyright line (OMP1's press
        // baseline), which also bounds the absence read.
        await page.goto(bookUrl(controlTag, control.submissionId));
        await expect(page.locator('.item.copyright')).toContainText(
            `Copyright (c) ${year}`
        );
        await expect(page.locator('.item.license')).toHaveCount(0);
    });

    test('S6: change the submission language (press: title only)', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        await ompApi.createContext({
            tag,
            context: {
                supportedLocales: ['en', 'fr_CA'],
                supportedSubmissionLocales: ['en', 'fr_CA'],
            },
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
        const [{submissionId}, published] = await Promise.all([
            ompApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: `${tag}au`,
                title: `Submission ${tag}`,
                locale: 'en',
            }),
            ompApi.createSubmission({
                tag: `${tag}p`,
                context: tag,
                submitter: `${tag}au`,
                title: `Submission ${tag}p`,
                decisions: ['skipExternalReview', 'sendToProduction'],
                published: true,
            }),
        ]);
        const frTitle = `Titre ${tag}`;

        const page = await (await asUser(`${tag}mg`)).newPage();
        await openWorkflow(page, tag, submissionId);

        // The stage screen shows the readout without a Change button.
        await expect(
            page.getByText('Current Submission Language: English')
        ).toBeVisible();
        await expect(page.getByRole('button', {name: 'Change', exact: true})).toHaveCount(0);

        // A Publication page shows the readout with the Change button.
        await openPublicationPage(page, 'Title & Abstract');
        await expect(
            page.getByText('Current Submission Language: English')
        ).toBeVisible();
        const changeButton = page.getByRole('button', {name: 'Change', exact: true});
        await expect(changeButton).toBeVisible();

        // Cancel closes the panel with nothing changed. Every open is
        // bounded by the panel's own form fetch (changeLanguageMetadata):
        // interacting with a still-loading panel can slip an empty Confirm
        // past the required check (observed while building this suite —
        // reported to the spec's register, not asserted either way).
        let formLoaded = page.waitForResponse(
            (r) => r.url().includes('changeLanguageMetadata') && r.ok(),
            {timeout: 30_000}
        );
        await changeButton.click();
        const panel = page.getByRole('dialog', {name: /Change Submission Language/});
        await expect(panel).toBeVisible({timeout: 30_000});
        await formLoaded;
        await expect(panel.getByRole('radio', {name: 'English'})).toBeChecked();
        await panel.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(panel).toHaveCount(0, {timeout: 30_000});
        await expect(
            page.getByText('Current Submission Language: English')
        ).toBeVisible();

        // Pick French: the warning appears with a required Title box and —
        // on a press — no Abstract box (Rule 13b's press leg).
        formLoaded = page.waitForResponse(
            (r) => r.url().includes('changeLanguageMetadata') && r.ok(),
            {timeout: 30_000}
        );
        await changeButton.click();
        await expect(panel).toBeVisible({timeout: 30_000});
        await formLoaded;
        await panel.getByRole('radio', {name: 'French (Canada)'}).check();
        await expect(
            panel.getByText(/Before changing the submission language/)
        ).toBeVisible();
        const titleLabel = panel
            .locator('label.pkpFormFieldLabel')
            .filter({hasText: /^Title\b/});
        await expect(titleLabel.first()).toBeVisible();
        await expect(
            panel.locator('label.pkpFormFieldLabel').filter({hasText: /^Abstract/})
        ).toHaveCount(0);

        // Confirm with the Title empty is refused in the browser. The box
        // is cleared explicitly first — interacting with the editor also
        // guarantees it is initialized before Confirm (clicked earlier, a
        // Confirm can race the panel's async form load).
        const titleBox = panel.frameLocator('iframe').first().locator('body');
        await titleBox.click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('Delete');
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        await expect(panel.getByText('This field is required.').first()).toBeVisible();
        await expect(panel.getByText('Please correct one error.')).toBeVisible();

        // Fill the French title and confirm: the screen reloads on Title &
        // Abstract, now in French, the English copy behind the language bar.
        await titleBox.click();
        await titleBox.fill(frTitle);
        const changed = page.waitForResponse(
            (r) => r.url().includes('/changeLocale') && r.ok(),
            {timeout: 30_000}
        );
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        await changed;
        await expect(
            page.getByRole('heading', {name: 'Publication: Title & Abstract'})
        ).toBeVisible({timeout: 60_000});
        await expect(
            page.getByText('Current Submission Language: French (Canada)')
        ).toBeVisible();
        await expect(richBody(page, /^Title\b/)).toContainText(frTitle);

        // The language bar reveals the English column with the old title
        // (read through the column's own TinyMCE editor — the per-locale
        // control id is stable, the iframe order is not).
        await page.locator('.pkpFormLocales').getByRole('button', {name: 'English'}).click();
        await expect
            .poll(
                () =>
                    page.evaluate(
                        () =>
                            window.tinymce
                                ?.get('titleAbstract-title-control-en')
                                ?.getContent() ?? ''
                    ),
                {timeout: 30_000}
            )
            .toContain(`Submission ${tag}`);

        // The contributor's names were copied into the new language: the
        // Edit form's Given Name, now opening in French, holds the copy.
        await openPublicationPage(page, 'Contributors');
        const item = page.getByRole('listitem').filter({hasText: 'Ada Author'}).first();
        await item.getByRole('button', {name: 'Edit', exact: true}).click();
        const contributorPanel = page
            .getByRole('dialog')
            .filter({has: page.locator('input[name^="givenName"]')});
        await expect(contributorPanel).toBeVisible({timeout: 30_000});
        await expect(
            contributorPanel.locator('input[name^="givenName"]').first()
        ).toHaveValue('Ada');
        // (No Cancel control on this panel; the next navigation discards it.)

        // Controls: the published item shows neither readout nor Change on
        // its Publication pages, while its stage screen keeps the readout
        // without the button.
        await openWorkflow(page, tag, published.submissionId);
        await openPublicationPage(page, 'Title & Abstract');
        await expect(page.getByText('Current Submission Language:')).toHaveCount(0);
        await page.getByRole('link', {name: 'Production', exact: true}).click();
        await expect(
            page.getByText('Current Submission Language: English')
        ).toBeVisible({timeout: 30_000});
        await expect(page.getByRole('button', {name: 'Change', exact: true})).toHaveCount(0);

        // The author's Publication pages never show readout or button.
        const authorPage = await (await asUser(`${tag}au`)).newPage();
        await openWorkflow(authorPage, tag, submissionId, {author: true});
        await openPublicationPage(authorPage, 'Title & Abstract');
        await expect(authorPage.getByText('Current Submission Language:')).toHaveCount(0);
        await expect(
            authorPage.getByRole('button', {name: 'Change', exact: true})
        ).toHaveCount(0);
    });

    test('S7: reset every monograph\'s permissions', async ({asUser, ompApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const year = String(new Date().getFullYear());
        const pressName = `Scratch context ${tag}`;
        await ompApi.createContext({
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
            ],
        });
        const {submissionId} = await ompApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            published: true,
        });

        // Override the published item's Copyright Holder.
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await openWorkflow(managerPage, tag, submissionId);
        await openPublicationPage(managerPage, 'Permissions & Disclosure');
        const holderField = field(managerPage, /^Copyright Holder/);
        const holderInput = holderField.locator('input').first();
        await expect(holderInput).toBeEnabled();
        await holderInput.fill('Example Society');
        await savePublicationForm(managerPage);

        // Tools › Permissions. Cancelling the native confirm resets nothing.
        await managerPage.goto(`/index.php/${tag}/management/tools`);
        await managerPage.getByRole('tab', {name: 'Permissions'}).click();
        const resetButton = managerPage.getByRole('button', {
            name: 'Reset Monograph Permissions',
        });
        await expect(resetButton).toBeVisible({timeout: 30_000});
        managerPage.once('dialog', (dialog) => dialog.dismiss());
        await resetButton.click();
        await openWorkflow(managerPage, tag, submissionId);
        await openPublicationPage(managerPage, 'Permissions & Disclosure');
        await expect(holderInput).toHaveValue('Example Society');

        // Reload the tools page (the Cancel case's button state is A13's
        // — not asserted) and confirm: the reset runs.
        await managerPage.goto(`/index.php/${tag}/management/tools`);
        await managerPage.getByRole('tab', {name: 'Permissions'}).click();
        await expect(resetButton).toBeVisible({timeout: 30_000});
        managerPage.once('dialog', (dialog) => dialog.accept());
        const reset = managerPage.waitForResponse(
            (r) => r.url().includes('resetPermissions') && r.ok(),
            {timeout: 30_000}
        );
        await resetButton.click();
        await reset;
        await expect(
            managerPage.getByText('Monograph permissions were successfully reset.')
        ).toBeVisible({timeout: 30_000});

        // The override is gone: the press's default holder (its own name)
        // and the current year, and the book page's copyright line follows.
        await openWorkflow(managerPage, tag, submissionId);
        await openPublicationPage(managerPage, 'Permissions & Disclosure');
        await expect(holderInput).toHaveValue(pressName, {timeout: 30_000});
        await expect(field(managerPage, /^Copyright Year/).locator('input').first()).toHaveValue(
            year
        );

        await page.goto(bookUrl(tag, submissionId));
        await expect(page.locator('.item.copyright')).toContainText(
            `Copyright (c) ${year} ${pressName}`
        );
    });

    test('S8: statements reach the reader', async ({asUser, ompApi, page}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        await ompApi.createContext({
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
            ],
        });
        const {submissionId} = await ompApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: `${tag}au`,
            title: `Submission ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            published: true,
        });
        const dataStatement = `Data are available on request ${tag}.`;
        const fundingStatement = `Funded by the Example Fund ${tag}.`;

        // Control: before anything is filled the book page shows neither
        // block (bounded by the page having rendered its title).
        await page.goto(bookUrl(tag, submissionId));
        await expect(
            page.getByText(`Submission ${tag}`).first()
        ).toBeVisible({timeout: 30_000});
        await expect(page.locator('.item.dataAvailability')).toHaveCount(0);
        await expect(page.locator('.item.fundingStatement')).toHaveCount(0);

        // Enable the data availability statement and the funding statement.
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await openMetadataSettings(managerPage, tag);
        const form = metadataSettingsForm(managerPage);
        await form
            .getByRole('checkbox', {name: 'Enable data availability statement metadata'})
            .check();
        await form
            .getByRole('checkbox', {name: 'Enable funding statement metadata'})
            .check();
        await saveSettingsForm(managerPage, form);

        // The Publication area gains a "Data" entry; enter the statement.
        await openWorkflow(managerPage, tag, submissionId);
        await openPublicationPage(managerPage, 'Data');
        const dataBody = richBody(managerPage, /^Data Availability Statement/);
        await dataBody.click();
        await dataBody.fill(dataStatement);
        await savePublicationForm(managerPage);

        // The Metadata page carries the Funding Statement field.
        await openPublicationPage(managerPage, 'Metadata');
        const fundingBody = richBody(managerPage, /^Funding Statement/);
        await fundingBody.click();
        await fundingBody.fill(fundingStatement);
        await savePublicationForm(managerPage);

        // Both blocks reach the reader.
        await page.goto(bookUrl(tag, submissionId));
        await expect(page.locator('.item.dataAvailability')).toContainText(dataStatement);
        await expect(page.locator('.item.fundingStatement')).toContainText(
            fundingStatement
        );

        // Disabling the statement removes the "Data" entry (data citations
        // are off on a fresh press) but readers keep seeing the statement.
        await openMetadataSettings(managerPage, tag);
        await form
            .getByRole('checkbox', {name: 'Enable data availability statement metadata'})
            .uncheck();
        await saveSettingsForm(managerPage, form);

        await openWorkflow(managerPage, tag, submissionId);
        await expect(
            managerPage.getByRole('link', {name: 'Title & Abstract', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(
            managerPage.getByRole('link', {name: 'Data', exact: true})
        ).toHaveCount(0);

        await page.goto(bookUrl(tag, submissionId));
        await expect(page.locator('.item.dataAvailability')).toContainText(dataStatement);
    });

    test('S10: an Edited Volume carries a Default Chapter License URL', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        await ompApi.createContext({
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
            ],
        });
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await setLicenseSettings(managerPage, tag, {license: 'CC Attribution 4.0'});
        const [volume, monograph] = await Promise.all([
            ompApi.createSubmission({
                tag: `${tag}v`,
                context: tag,
                submitter: `${tag}au`,
                title: `Volume ${tag}`,
                workType: 'editedVolume',
            }),
            ompApi.createSubmission({
                tag: `${tag}m`,
                context: tag,
                submitter: `${tag}au`,
                title: `Monograph ${tag}`,
                workType: 'monograph',
            }),
        ]);

        // The Edited Volume's Permissions & Disclosure adds the fourth
        // field, locked with an Override and the inherited-license sentence.
        await openWorkflow(managerPage, tag, volume.submissionId);
        await openPublicationPage(managerPage, 'Permissions & Disclosure');
        const chapterField = field(managerPage, /^Default Chapter License URL/);
        await expect(chapterField).toBeVisible();
        await expect(chapterField.locator('input').first()).toBeDisabled();
        await expect(chapterField.getByRole('button', {name: 'Override'})).toBeVisible();
        await expect(
            chapterField.getByText(
                'The license will be set automatically to CC Attribution 4.0 when this is published.'
            )
        ).toBeVisible();

        // Override with another license address; the value survives Save
        // and reload, unlocked.
        await chapterField.getByRole('button', {name: 'Override'}).click();
        await chapterField.locator('input').first().fill(CC_BY_SA);
        await savePublicationForm(managerPage);
        await openWorkflow(managerPage, tag, volume.submissionId);
        await openPublicationPage(managerPage, 'Permissions & Disclosure');
        await expect(chapterField.locator('input').first()).toHaveValue(CC_BY_SA, {
            timeout: 30_000,
        });
        await expect(chapterField.locator('input').first()).toBeEnabled();
        await expect(chapterField.getByRole('button', {name: 'Override'})).toHaveCount(0);

        // A Monograph has no such field — bounded by the page's other
        // license fields rendering.
        await openWorkflow(managerPage, tag, monograph.submissionId);
        await openPublicationPage(managerPage, 'Permissions & Disclosure');
        await expect(field(managerPage, /^License URL/)).toBeVisible();
        await expect(field(managerPage, /^Default Chapter License URL/)).toHaveCount(0);
    });
});
