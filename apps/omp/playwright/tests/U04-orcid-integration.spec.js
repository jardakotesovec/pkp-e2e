// @ts-check
/**
 * @file playwright/tests/U04-orcid-integration.spec.js
 *
 * ORCID integration — OMP suite, one test per canonical scenario the spec
 * runs on a press, in press vocabulary (glossary substitution: press,
 * monograph, Press Manager). Parallel-safe scenarios live here (S1–S3,
 * S5–S7, S10); the scenarios that assert on queued-job ORCID email
 * (S4, S8, and S11's absence on a press) live in
 * tests/serial/U04-orcid-integration.spec.js — ORCID mail only reaches
 * Mailpit after an explicit queue-worker run, which must never happen
 * while parallel agents seed (patterns.md parallel lesson 7). The spec's
 * scenario 9 is {OJS}-only (review deposits) and does not run on the press.
 * Spec: docs/specs/U04-orcid-integration.md
 *
 * Not covered, by register ID (the spec's Coverage section is the record
 * of everything else left out): A1, A2, A3, A4, A5, A6, A8, A13, A18, A19,
 * A20.
 *
 * Every test seeds its own scratch press via the scenario endpoints
 * (publicknowledge and the seeded roster stay untouched); ORCID enablement
 * and iD fixture states use the U4 scenario passthroughs (context `orcid`,
 * users[] `orcid`/`orcidIsVerified`, submission `author`). ORCID's own
 * sign-in never completes on the fleets (dead-port proxy, dummy
 * credentials), so every scenario stops at the popup; verified and
 * unauthenticated iDs are seeded. S10's request email is queued mail this
 * parallel suite never drains, so the field alone is read there.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    AboutOrcidPage,
    OrcidSettingsTab,
    ProfileIdentityPage,
    hollowOrcidIcon,
    openContributors,
    openContributorEditor,
    orcidField,
    requestVerification,
    solidOrcidIcon,
    REQUEST_QUESTION,
    REQUESTED_TEXT,
} = require('../pages/OrcidPages.js');
const {openEditorial} = require('../pages/ReviewStagePages.js');
const {ContributorsScreen} = require('../pages/ContributorPages.js');
const {RegisterPage, RegistrationCompletePage} = require('../pages/RegistrationPages.js');
const {WebsitePluginsPage} = require('../../../../shared/playwright/pages/PluginsPages.js');
const {MySubmissionsPage} = require('../../../../shared/playwright/pages/MySubmissionsPage.js');
const {
    STEPS,
    expectWizardOpen,
    expectStep,
    continueTo,
    openContributorEdit,
} = require('../pages/SubmissionWizardPages.js');

/** A seedable test iD (ORCID's own example iD, sandbox-hosted). */
const TEST_ORCID = 'https://sandbox.orcid.org/0000-0002-1825-0097';

const UNVERIFIED_NOTE =
    'This ORCID has not been verified. Please remove this unverified ORCID and request verification from the user/author directly.';

/** Unique per-run tag: single alphanumeric token, carries app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u4${scenario}ompw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

// Re-enabled 2026-08-26 (maintainer): the dead-port proxy + sandbox-only dummy
// credentials stand — no real ORCID traffic is possible from these tests
// (see header); S2's popup asserts the sandbox URL only, without driving it,
// and its browser-side requests to ORCID are stubbed (support/orcid.js).
test.describe('ORCID integration', () => {
    test('S1: turning ORCID on adds the profile block; off removes it', {tag: '@smoke'}, async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const manager = `mgr${tag}`;
        // No orcid passthrough here — the settings tab itself is under test.
        await ompApi.createContext({tag, users: [{username: manager, roles: ['manager']}]});

        const managerSession = await asUser(manager);
        const managerPage = await managerSession.newPage();
        const settings = new OrcidSettingsTab(managerPage, tag);
        await settings.goto();
        // The profile's Identity tab, in another browser tab of the same
        // session (footnote s).
        const profile = new ProfileIdentityPage(await managerSession.newPage(), tag);

        // Credentials empty: off by default; the API/credential fields only
        // appear once ticked; "Save" with both credentials empty is refused
        // in the browser and sends nothing (Fields "Client ID" / "Client
        // Secret"), so the Identity tab still shows no ORCID field (Rules 1, 4).
        await expect(settings.enableCheckbox).not.toBeChecked();
        await expect(settings.apiSelect).toHaveCount(0);
        await settings.enableCheckbox.check();
        await expect(settings.apiSelect).toBeVisible();
        await expect(settings.clientIdInput).toHaveValue('');
        await expect(settings.clientSecretInput).toHaveValue('');
        const refusedSave = await settings.pressRefusedSave();
        await expect(settings.requiredErrors).toHaveCount(2);
        await expect(settings.panel).toContainText('Please correct 2 errors.');
        expect(refusedSave).toEqual([]);
        await profile.goto();
        await expect(profile.form.locator('input[name^="givenName"]')).toBeVisible();
        await expect(profile.orcidContainer).toHaveCount(0);

        // Credentials filled: Public Sandbox and the placeholder pair; the
        // save does not check them against ORCID.
        await settings.apiSelect.selectOption({label: 'Public Sandbox'});
        await settings.clientIdInput.fill('APP-TEST');
        await settings.clientSecretInput.fill('test-secret');
        await settings.save();

        // The profile's Identity tab, in the other browser tab, now offers
        // the connect block (Rule 5).
        await profile.goto();
        await expect(profile.connectButton).toBeVisible();
        await expect(profile.connectButton).toContainText('Create or Connect your ORCID iD');
        await expect(profile.aboutLink).toBeVisible();

        // A City left unsaved: it survives a trip to the "Roles" tab and
        // back, and is dropped without a question once the manager leaves
        // Users & Roles for Settings › Press (Rule 1).
        await expect(settings.cityInput).toHaveValue('');
        await settings.cityInput.fill('Vancouver');
        await settings.visitTabAndBack('Roles');
        await expect(settings.cityInput).toHaveValue('Vancouver');
        const questions = [];
        managerPage.on('dialog', (dialog) => {
            questions.push(`${dialog.type()}: ${dialog.message()}`);
            dialog.accept().catch(() => {});
        });
        await managerPage.goto(settings.contextUrl(tag, '/management/settings/context'));
        await expect(managerPage).toHaveURL(/\/management\/settings\/context/);
        await expect(managerPage.getByRole('heading', {level: 1})).toBeVisible();
        expect(questions).toEqual([]);
        await settings.goto();
        await expect(settings.enableCheckbox).toBeChecked();
        await expect(settings.cityInput).toHaveValue('');

        // Settings › Website › Plugins, "Installed Plugins": no ORCID row
        // (Rule 16); a row the list does show, searched the same way, is the
        // positive control.
        const plugins = new WebsitePluginsPage(managerPage, tag);
        await plugins.goto();
        await plugins.list.search({text: 'Dublin Core'});
        await expect(plugins.list.pluginRows.filter({hasText: 'Dublin Core 1.1 metadata'})).toHaveCount(1);
        await plugins.list.search({text: 'ORCID'});
        await expect(plugins.list.pluginRows).toHaveCount(0);
        await expect(plugins.list.grid.getByText(/ORCID/i)).toHaveCount(0);

        // Untick and save (control): the tab kept the saved state, and the
        // Identity tab shows no ORCID field at all (Rule 4).
        await settings.goto();
        await expect(settings.enableCheckbox).toBeChecked();
        await settings.enableCheckbox.uncheck();
        await settings.save();

        await profile.goto();
        await expect(profile.form.locator('input[name^="givenName"]')).toBeVisible();
        await expect(profile.orcidContainer).toHaveCount(0);
    });

    test('S2: the connect button opens the ORCID sign-in popup', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s2', testInfo);
        const author = `aut${tag}`;
        await ompApi.createContext({
            tag,
            users: [{username: author, roles: ['author']}],
            orcid: {},
        });

        const userPage = await (await asUser(author)).newPage();
        const profile = new ProfileIdentityPage(userPage, tag);
        await profile.goto();

        // Pressing the button opens a small popup on an ORCID sandbox sign-in
        // address (Public Sandbox config) while the profile stays put. The
        // test never drives past its address: ORCID's site is answered
        // locally (pressConnect), so the popup does not wait on ORCID.
        const popup = await profile.pressConnect();
        await expect
            .poll(() => popup.url(), {timeout: 15_000})
            .toMatch(/sandbox\.orcid\.org\/[^?]*\?.*client_id=/);
        expect(popup.url()).toContain('authorizeOrcid');
        expect(userPage.url()).toContain('/user/profile');
        await popup.close();
        // The "What is ORCID?" link beside the button is register finding A4
        // (its click opens this same popup) — not asserted here; the page it
        // names is covered by URL in S6.
    });

    test('S3: a verified iD is removed from the profile via Delete', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s3', testInfo);
        const holder = `usr${tag}`;
        const unauthenticated = `una${tag}`;
        await ompApi.createContext({
            tag,
            users: [
                {username: holder, roles: ['author'], orcid: TEST_ORCID, orcidIsVerified: true},
                {username: unauthenticated, roles: ['author'], orcid: TEST_ORCID, orcidIsVerified: false},
            ],
            orcid: {},
        });

        const userPage = await (await asUser(holder)).newPage();
        const profile = new ProfileIdentityPage(userPage, tag);
        await profile.goto();

        // Verified state: the bare-iD link with the solid icon, plus Delete;
        // the connect button and the About link are gone (Rule 5).
        await expect(profile.orcidLink).toBeVisible();
        await expect(profile.orcidLink).toHaveAttribute('href', TEST_ORCID);
        await expect(profile.orcidLink).not.toContainText('(unauthenticated)');
        await expect(solidOrcidIcon(profile.orcidLink)).toBeVisible();
        await expect(hollowOrcidIcon(profile.orcidLink)).toHaveCount(0);
        await expect(profile.deleteButton).toBeVisible();
        await expect(profile.connectButton).toHaveCount(0);
        await expect(profile.aboutLink).toHaveCount(0);

        // The second user's Identity tab, in a browser of their own:
        // the unauthenticated iD as a hollow-icon link suffixed
        // "(unauthenticated)" and the "Authorize and Connect" button (Rule 5).
        const secondProfile = new ProfileIdentityPage(
            await (await asUser(unauthenticated)).newPage(), tag
        );
        await secondProfile.goto();
        await expect(secondProfile.unauthenticatedLink).toBeVisible();
        await expect(secondProfile.unauthenticatedLink).toHaveAttribute('href', TEST_ORCID);
        await expect(secondProfile.unauthenticatedLink).toContainText(
            `${TEST_ORCID} (unauthenticated)`
        );
        await expect(hollowOrcidIcon(secondProfile.unauthenticatedLink)).toBeVisible();
        await expect(solidOrcidIcon(secondProfile.unauthenticatedLink)).toHaveCount(0);
        await expect(secondProfile.connectButton).toBeVisible();
        await expect(secondProfile.connectButton).toContainText('Authorize and Connect your ORCID iD');
        // The "What is ORCID?" link beside it (Rules 5, 6a), the one the
        // verified tab above no longer shows; where it leads is A4's.
        await expect(secondProfile.aboutLink).toBeVisible();
        await expect(secondProfile.orcidLink).toHaveCount(0);
        await expect(secondProfile.deleteButton).toHaveCount(0);

        // Delete opens a window titled "Confirm" with the question, "OK" and
        // "Cancel"; "OK" removes the iD at once — no separate save (Rule 6c).
        await profile.deleteButton.click();
        const dialog = userPage.getByRole('dialog', {name: 'Confirm', exact: true});
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('Are you sure you want to remove this ORCID?');
        await expect(dialog.getByRole('button', {name: 'OK', exact: true})).toBeVisible();
        await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        await dialog.getByRole('button', {name: 'OK', exact: true}).click();

        await expect(profile.connectButton).toBeVisible();
        await expect(profile.orcidLink).toHaveCount(0);

        // Persisted: a fresh load still shows the connect state.
        await profile.goto();
        await expect(profile.connectButton).toBeVisible();
        await expect(profile.connectButton).toContainText('Create or Connect your ORCID iD');
        await expect(profile.deleteButton).toHaveCount(0);
    });

    test('S5: a contributor\'s unauthenticated iD is removed via Delete', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s5', testInfo);
        const manager = `mgr${tag}`;
        const author = `aut${tag}`;
        await ompApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: author, roles: ['author']},
            ],
            orcid: {},
        });
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            author: {orcid: TEST_ORCID, orcidIsVerified: false},
        });

        const managerPage = await (await asUser(manager)).newPage();
        await openEditorial(managerPage, tag, submissionId);
        await openContributors(managerPage);
        const modal = await openContributorEditor(managerPage, author);

        // Unauthenticated state: the suffixed iD link, the not-verified
        // warning, and Delete (Fields table; Rule 8c).
        const field = orcidField(modal);
        const idLink = field.getByRole('link', {name: new RegExp(TEST_ORCID.split('/').pop())});
        await expect(idLink).toBeVisible();
        await expect(field).toContainText('(unauthenticated)');
        await expect(hollowOrcidIcon(field)).toBeVisible();
        await expect(solidOrcidIcon(field)).toHaveCount(0);
        await expect(field).toContainText(UNVERIFIED_NOTE);

        await field.getByRole('button', {name: 'Delete', exact: true}).click();
        const dialog = managerPage
            .getByRole('dialog')
            .filter({hasText: 'Are you sure you want to remove this ORCID?'});
        await expect(dialog).toContainText('Delete ORCID');
        const deleted = managerPage.waitForResponse(
            (response) => response.url().includes('/orcid/deleteForAuthor/') && response.ok()
        );
        await dialog.getByRole('button', {name: 'Yes', exact: true}).click();
        await deleted;

        // The field reverts to the no-iD state offering a fresh request.
        await expect(field.getByRole('button', {name: 'Request verification'})).toBeVisible();
        await expect(idLink).toHaveCount(0);
        await expect(field).not.toContainText('(unauthenticated)');
        await expect(hollowOrcidIcon(field)).toHaveCount(0);
    });

    test('S6: the public ORCID pages render by URL', async ({page, ompApi}, testInfo) => {
        const tag = makeTag('s6', testInfo);
        await ompApi.createContext({tag, orcid: {}});

        // Signed-out visitor (the default page carries no session), addresses
        // typed directly — both render inside the press chrome (Rule 10;
        // Rule 9's failure landing).
        const about = new AboutOrcidPage(page);
        await about.goto(tag);
        await expect(about.header).toBeVisible();
        await expect(about.header).toContainText(`Scratch context ${tag}`);
        await expect(about.footer).toBeVisible();
        // The page sits between the press's own header and footer.
        const [headerBox, headingBox, footerBox] = await Promise.all([
            about.header.boundingBox(),
            about.heading.boundingBox(),
            about.footer.boundingBox(),
        ]);
        expect(headerBox.y).toBeLessThan(headingBox.y);
        expect(headingBox.y).toBeLessThan(footerBox.y);

        await page.goto(`/index.php/${tag}/orcid/verify`);
        await expect(page.getByRole('heading', {name: 'ORCID Authorization'})).toBeVisible();
        await expect(
            page.getByText('Your ORCID iD could not be verified. The link is no longer valid.')
        ).toBeVisible();
        // The page's closing contact sentence is register finding A8 (it says
        // "journal manager" on a press) — deliberately not asserted.
    });

    test('S7: a press with ORCID off shows none of it', async ({page, asUser, ompApi}, testInfo) => {
        test.slow();
        const tagOff = makeTag('s7f', testInfo);
        const tagOn = makeTag('s7n', testInfo);
        const seedFor = (tag, orcid) =>
            ompApi.createContext({
                tag,
                users: [
                    {username: `mgr${tag}`, roles: ['manager']},
                    {username: `aut${tag}`, roles: ['author']},
                ],
                ...(orcid ? {orcid: {}} : {}),
            });
        await seedFor(tagOff, false);
        await seedFor(tagOn, true);
        const {submissionId: subOff} = await ompApi.createSubmission({
            tag: tagOff, context: tagOff, submitter: `aut${tagOff}`,
        });
        const {submissionId: subOn} = await ompApi.createSubmission({
            tag: tagOn, context: tagOn, submitter: `aut${tagOn}`,
        });

        // Registration page (signed out): no ORCID block on the off press;
        // the enabled press shows it (positive control).
        const register = new RegisterPage(page);
        await page.goto(RegisterPage.contextUrl(tagOff));
        await expect(register.submitButton).toBeVisible();
        await expect(page.locator('#connect-orcid-button')).toHaveCount(0);
        await page.goto(RegisterPage.contextUrl(tagOn));
        await expect(page.locator('#connect-orcid-button')).toBeVisible();

        // The site-level Register page (the site hosts more than one press
        // once a scratch press exists): no ORCID block either, while the
        // enabled press's Register page offers "Create or Connect your ORCID
        // iD" at the top of its form (Actors row 3).
        await page.goto(RegisterPage.siteUrl());
        await expect(register.heading).toBeVisible();
        await expect(register.submitButton).toBeVisible();
        await expect(page.locator('#connect-orcid-button')).toHaveCount(0);
        await page.goto(RegisterPage.contextUrl(tagOn));
        const connectButton = register.form.locator('#connect-orcid-button');
        await expect(connectButton).toBeVisible();
        await expect(connectButton).toContainText('Create or Connect your ORCID iD');
        await expect(register.givenName).toBeVisible();
        const [buttonBox, firstFieldBox] = await Promise.all([
            connectButton.boundingBox(),
            register.givenName.boundingBox(),
        ]);
        expect(buttonBox.y).toBeLessThan(firstFieldBox.y);

        // Registering without connecting (Rule 7): the form is U02's; only
        // the completion is asserted, the connect button never pressed and
        // the form's hidden iD left empty.
        const username = `u04s7-${tagOn}`;
        await register.fillIdentity({
            givenName: 'Seven',
            email: `${username}@mail.test`,
            username,
            password: `${username}${username}`,
        });
        if (await register.privacyConsent.count()) {
            await register.privacyConsent.check();
        }
        await expect(register.form.locator('input[name="orcid"]')).toHaveValue('');
        let popupOpened = false;
        page.once('popup', () => {
            popupOpened = true;
        });
        await register.submit();
        await expect(new RegistrationCompletePage(page).heading).toBeVisible();
        expect(popupOpened).toBe(false);

        // Profile Identity tab: no ORCID field at all on the off press;
        // the connect block on the enabled one (Rules 4–5).
        const offProfile = new ProfileIdentityPage(
            await (await asUser(`aut${tagOff}`)).newPage(), tagOff
        );
        await offProfile.goto();
        await expect(offProfile.form.locator('input[name^="givenName"]')).toBeVisible();
        await expect(offProfile.orcidContainer).toHaveCount(0);
        const onProfile = new ProfileIdentityPage(
            await (await asUser(`aut${tagOn}`)).newPage(), tagOn
        );
        await onProfile.goto();
        await expect(onProfile.connectButton).toBeVisible();

        // Contributor form: no ORCID iD field on the off press; the field
        // with its request control on the enabled one (Rule 8).
        const offManagerPage = await (await asUser(`mgr${tagOff}`)).newPage();
        await openEditorial(offManagerPage, tagOff, subOff);
        await openContributors(offManagerPage);
        const offModal = await openContributorEditor(offManagerPage, `aut${tagOff}`);
        await expect(offModal.locator('#contributor-email-control')).toBeVisible();
        await expect(offModal.getByText('ORCID iD')).toHaveCount(0);

        const onManagerPage = await (await asUser(`mgr${tagOn}`)).newPage();
        await openEditorial(onManagerPage, tagOn, subOn);
        await openContributors(onManagerPage);
        const onModal = await openContributorEditor(onManagerPage, `aut${tagOn}`);
        await expect(orcidField(onModal).getByRole('button', {name: 'Request verification'})).toBeVisible();
    });

    test('S10: the Author\'s contributor list is read-only; the wizard offers the request', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        const manager = `mgr${tag}`;
        const author = `aut${tag}`;
        await ompApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: author, roles: ['author']},
            ],
            orcid: {},
        });
        const submittedTitle = `subm${tag}`;
        const draftTitle = `draft${tag}`;
        const {submissionId} = await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: submittedTitle, submitted: true,
        });
        const draft = await ompApi.createSubmission({
            tag: `${tag}d`, context: tag, submitter: author, title: draftTitle, submitted: false,
        });

        // The submitted submission, opened from the author's dashboard: its
        // Contributors list is read-only — the contributor is listed, no Edit
        // opens it, no Add Contributor, so no ORCID iD field and no "Request
        // verification" is reached (Actors row 5).
        const authorPage = await (await asUser(author)).newPage();
        const mySub = new MySubmissionsPage(authorPage, tag);
        await mySub.goto();
        const row = await mySub.findRowByTag(submittedTitle);
        await mySub.viewButton(row).click();
        await mySub.expectWorkflowOpen();
        const contributors = new ContributorsScreen(authorPage);
        await contributors.openFromWorkflow();
        await expect(contributors.row(author)).toBeVisible();
        await expect(contributors.previewButton()).toBeVisible();
        await expect(contributors.row(author).getByRole('button', {name: 'Edit', exact: true})).toHaveCount(0);
        await expect(contributors.addContributorButton()).toHaveCount(0);
        await expect(authorPage.getByText('ORCID iD', {exact: true})).toHaveCount(0);
        await expect(authorPage.getByRole('button', {name: 'Request verification'})).toHaveCount(0);

        // Back to the dashboard by address (the workflow panel's own Close is
        // U22's; a fresh load is the settled way to leave it here).
        await mySub.goto();

        // The draft, opened from the dashboard, reopens the wizard on Upload
        // Files; "Continue" twice reaches Contributors, whose own contributor
        // opens for editing: the ORCID iD field offers "Request verification";
        // confirming the dialog flips the field (Rule 8; Actors row 5). The
        // email is queued mail this parallel suite never drains.
        const draftRow = await mySub.findRowByTag(draftTitle);
        await mySub.completeSubmissionButton(draftRow).click();
        await expectWizardOpen(authorPage);
        expect(authorPage.url()).toContain(`id=${draft.submissionId}`);
        await expectStep(authorPage, STEPS.files);
        await continueTo(authorPage, STEPS.details);
        await continueTo(authorPage, STEPS.contributors);
        const wizardModal = await openContributorEdit(authorPage, author);
        const wizardField = orcidField(wizardModal);
        await expect(wizardField.getByRole('button', {name: 'Request verification'})).toBeVisible();
        const wizardQuestion = await requestVerification(authorPage, wizardField);
        expect(wizardQuestion).toContain(REQUEST_QUESTION);
        await expect(wizardField).toContainText(REQUESTED_TEXT);
        await expect(wizardField.getByRole('button', {name: 'Request verification'})).toHaveCount(0);

        // Control: the Press Manager, in a browser of their own, edits the
        // same contributor on the submitted submission: "Request verification"
        // is offered (Rule 8).
        const managerPage = await (await asUser(manager)).newPage();
        await openEditorial(managerPage, tag, submissionId);
        await openContributors(managerPage);
        const modal = await openContributorEditor(managerPage, author);
        await expect(orcidField(modal).getByRole('button', {name: 'Request verification'})).toBeVisible();
    });
});
