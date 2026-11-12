// @ts-check
/**
 * @file playwright/tests/U07-journal-identity-and-about-pages.spec.js
 *
 * Journal identity & about pages — OJS suite, one test per canonical
 * scenario the spec runs on OJS (scenarios 1–11, 13 and 14, all common;
 * scenario 12 is OPS-only).
 * Spec: docs/specs/U07-journal-identity-and-about-pages.md
 *
 * Deliberately NOT covered (register IDs): A1, A7, A8, A9, A10, A11, A14
 * (A2, A3 and A6 are read only as the scenarios state them; OMP1, OMP2,
 * OPS1, OPS2, OPS3 and OPS4 are a press's and a preprint server's).
 *
 * Seeding: scenario endpoints only. S1 and S2 read the seeded journal
 * `publicknowledge` with roster accounts and change nothing there; every
 * other test seeds its own scratch journal with throwaway accounts
 * (footnote y), through the context keys `name`, `acronym`, `country`,
 * `sidebar`, `plugins`, `issues[]` and `roles.<key>.permitSettings`, the
 * user keys `affiliation`, `orcid`/`orcidIsVerified`, `masthead` and
 * `pastRoles[]`, and the submission keys `published`/`issue`, `submitted:
 * false` and `reviewRounds[].reviewers[].dateCompleted` (scenarios.md). A
 * scratch journal has no Country and no technical support contact
 * (seed-facts): S3 picks a Country and S4 types the support contact as
 * the scenarios' own steps. Every screen change a scenario's step names
 * (the tabs' saves, the invitations, "Remove Role", the masthead choice,
 * "Remove User", "Disable User", "Merge user", the role boxes, the
 * "Editorial Masthead" tab's boxes, "Disable Submissions", the wizard's
 * submit and the publishes) is driven on screen.
 * Signed-out reads run in a browser context with an empty storage state
 * (patterns.md, parallel lesson 8); each actor gets its own `asUser`
 * context. Mail is read by unique throwaway recipients (PRINCIPLES A8).
 * No test changes a site setting (S5's site page is only read), so the
 * whole suite runs in the parallel `ojs` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    AboutPages,
    SettingsPages,
    RolesTab,
    whole,
} = require('../../../../shared/playwright/pages/ContextIdentityPages.js');
const {
    UsersRolesPage,
    SendInvitationWizard,
    AcceptInvitationWizard,
} = require('../pages/UserInvitationPages.js');
const {createIssue} = require('../pages/PublicationMetadataPages.js');
const {PublishScreen} = require('../pages/PublishSchedulePages.js');
const {SubmissionWizardPage} = require('../pages/SubmissionWizardPage.js');
const {
    UsersListPage,
    DisableUserWindow,
    RemoveUserDialog,
    MergeUserWindow,
} = require('../../../../shared/playwright/pages/UsersManagementPages.js');
const {WebsiteSettings} = require('../../../../shared/playwright/pages/AppearancePages.js');
const {ArticleLandingPage} = require('../../../../shared/playwright/pages/ArticleLandingPages.js');

const JOURNAL = 'publicknowledge';
const JOURNAL_TITLE = 'Journal of Public Knowledge';
const T = 30_000;
const REQUIRED = 'This field is required.';
const DEFAULT_PRIVACY =
    'The names and email addresses entered in this journal site will be used exclusively for the stated purposes of this journal and will not be made available for any other purpose or to any other party.';
const NOT_ACCEPTING =
    /This journal is not accepting submissions at this time\. Visit the workflow settings to allow submissions\./;
const MASTHEAD_BOX = 'Consider role in masthead list';
const THIS_YEAR = new Date().getUTCFullYear();
const LAST_YEAR = THIS_YEAR - 1;

/** The five Settings pages, their side-menu entry and heading on a journal (Rule 1). */
const SETTINGS = [
    {key: 'journal', entry: 'Journal', heading: 'Journal Settings'},
    {key: 'website', entry: 'Website', heading: 'Website Settings'},
    {key: 'workflow', entry: 'Workflow', heading: 'Workflow Settings'},
    {key: 'distribution', entry: 'Distribution', heading: 'Distribution Settings'},
    {key: 'usersRoles', entry: 'Users & Roles', heading: 'Users & Roles'},
];

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u7${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for a scratch journal (users.md: `<username>@mail.test`). */
function account(tag, suffix, givenName, familyName, roles, extra = {}) {
    return {username: `${tag}${suffix}`, givenName, familyName, email: `${tag}${suffix}@mail.test`, roles, ...extra};
}

/** YYYY-MM-DD, today in UTC (the PHP servers' zone), or `days` from today. */
function today(days = 0) {
    return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** A signed-out browser page (no inherited storage state). */
async function signedOutPage(browser, baseURL) {
    const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}, reducedMotion: 'reduce'});
    return context.newPage();
}

/** Open the user's landing page and wait for the side menu to render (or the public page, for a reader). */
async function openLanding(page, contextPath) {
    await page.goto(`/index.php/${contextPath}/submissions`);
    await expect(
        page.locator('nav [role="button"][aria-controls], #navigationPrimary').first()
    ).toBeVisible({timeout: T});
}

/** Text with runs of white space collapsed. */
function flat(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}

/** The HTML of a rich-text box reduced to its words. */
function words(html) {
    return flat((html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#39;|&rsquo;/g, "'"));
}

/**
 * The invitation email's accept link (the template's hrefs are
 * single-quoted), scoped by recipient and subject marker.
 */
async function acceptLink(pkpMail, {to, contains}) {
    const summary = await pkpMail.find({to, contains});
    const full = await pkpMail.fullMessage(summary.ID);
    const m = full.HTML.match(/href=['"]([^'"]*\/invitation\/accept\?[^'"]+)['"]/i);
    expect(m, 'the invitation email carries an accept link').not.toBeNull();
    return m ? m[1].replace(/&amp;/g, '&') : '';
}

/**
 * "Invite to a role" for an existing account of the journal, sent from
 * Users & Roles and accepted by the invitee from the mailbox (User
 * invitations scenario 3). `masthead: null` picks no masthead choice (the
 * row has none while the masthead is not based on enrollments).
 * `onDetails(wizard)` reads the "Enter details" step after the role row is
 * filled; `onReview(accept, page)` the invitee's review step. Returns the
 * invitation email's text.
 */
async function inviteAndAccept(page, contextPath, {browser, baseURL, pkpMail}, {email, role, startDate, masthead, subject, onDetails, onReview}) {
    const usersRoles = new UsersRolesPage(page, contextPath);
    const wizard = new SendInvitationWizard(page);
    await usersRoles.goto();
    await usersRoles.inviteButton.click();
    await wizard.searchAndContinue(email);
    await expect(wizard.existingNotice).toBeVisible();
    await wizard.fillRoleRow({role, startDate, masthead});
    if (onDetails) await onDetails(wizard);
    await wizard.saveAndContinue();
    await wizard.setSubject(subject);
    await wizard.send();
    await wizard.dismissSentDialog();
    const summary = await pkpMail.find({to: email, contains: subject});
    const full = await pkpMail.fullMessage(summary.ID);
    const link = await acceptLink(pkpMail, {to: email, contains: subject});
    const inviteePage = await signedOutPage(browser, baseURL);
    await inviteePage.goto(link);
    const accept = new AcceptInvitationWizard(inviteePage);
    await accept.expectOnReviewStep();
    if (onReview) await onReview(accept, inviteePage);
    await accept.accept();
    await inviteePage.context().close();
    return full.Text || '';
}

/**
 * Publish a submission in Production from its workflow by "Assign To
 * Future Issue and Publish Immediately" into an unpublished issue (U49
 * scenario 1, its Rule 5).
 */
async function publishIntoFutureIssue(page, contextPath, submissionId, issueLabel) {
    const pub = new PublishScreen(page, contextPath);
    await pub.gotoWorkflow(submissionId);
    await pub.openEntry('Title & Abstract');
    const panel = await pub.openPublishPanelExpectingIssueFields();
    await pub.fillVersionDetails(panel);
    const continuous = panel.getByRole('radio', {name: 'Assign To Future Issue and Publish Immediately'});
    await expect(continuous).toBeVisible({timeout: T});
    await continuous.check();
    await pub.selectIssueOption(panel, issueLabel);
    await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
    await pub.confirmPublish(pub.confirmationDialog('published immediately as continuous publication'), 'Publish');
    await pub.expectStatus('Published');
}

test.describe('journal identity & about pages', () => {
    test('S1: a visitor reads the seeded journal\'s About pages', {tag: '@smoke'}, async ({browser, baseURL, asUser}) => {
        test.slow();
        const visitor = await signedOutPage(browser, baseURL);
        const about = new AboutPages(visitor, JOURNAL, {locale: 'en'});

        // The "About" menu (Rule 12).
        await about.gotoHome();
        await about.openAboutMenu();
        await expect(about.aboutItems).toHaveText([
            whole('About the Journal'),
            whole('Submissions'),
            whole('Editorial Masthead'),
            whole('Privacy Statement'),
            whole('Contact'),
        ]);

        // "About the Journal": breadcrumb, heading and nothing after it; the
        // browser title (Rules 7, 12, 13).
        const seen = {};
        await about.chooseFromAboutMenu('About the Journal');
        expect(await about.breadcrumbTrail()).toEqual(['Home', 'About the Journal']);
        await expect(about.heading).toHaveText(whole('About the Journal'));
        expect(await about.bodyText()).toBe('About the Journal');
        await expect(visitor).toHaveTitle(`About the Journal | ${JOURNAL_TITLE}`);
        seen.about = {trail: await about.breadcrumbTrail(), body: await about.bodyText()};

        // "Editorial Masthead": the Journal editor and then the Section
        // editors, no Reviewer heading, entries "{year} – {name}" by family
        // name with no picture and no email; the history line and the rule,
        // no peer reviewers after it (Rules 14a, 14c, 14d, 15).
        await about.gotoHome();
        await about.chooseFromAboutMenu('Editorial Masthead');
        await expect(about.heading).toHaveText(whole('Editorial Masthead'));
        await expect(about.listHeadings()).toHaveText([whole('Journal editor'), whole('Section editor')]);
        await expect(about.listHeading('Reviewer')).toHaveCount(0);
        await expect(about.listHeading('Peer Reviewers in Previous Year')).toHaveCount(0);
        expect(await about.listNames('Journal editor')).toEqual(['Diana Editor']);
        // The three Section editors share the family name "Section Editor",
        // so their order among themselves is not a spec fact.
        expect((await about.listNames('Section editor')).sort()).toEqual([
            'Ana Section Editor',
            'Omar Section Editor',
            'Ravi Section Editor',
        ]);
        for (const heading of ['Journal editor', 'Section editor']) {
            const entries = about.listEntries(heading);
            for (let i = 0; i < (await entries.count()); i++) {
                const parts = about.entryParts(entries.nth(i));
                await expect(parts.dateStart).toHaveText(/^\s*\d{4} –\s*$/);
                await expect(parts.pictures).toHaveCount(0);
                await expect(parts.emailLinks).toHaveCount(0);
                expect(await entries.nth(i).innerText()).not.toContain('@');
            }
        }
        await expect(about.historyLine()).toHaveText(/^\s*View\s+Editorial History\s*$/);
        await expect(about.historyLink()).toBeVisible();
        await expect(about.rule()).toHaveCount(1);
        await expect(about.main.locator('.page_masthead > hr ~ *')).toHaveCount(0);
        seen.masthead = {trail: await about.breadcrumbTrail(), body: await about.bodyText()};

        // "Editorial History" from that line: headed "Editorial History
        // Page" under the breadcrumb "Editorial History", the sentence alone
        // (Rules 12, 16; A6 as the scenario states it).
        await about.historyLink().click();
        await expect(about.heading).toHaveText(whole('Editorial History Page'));
        expect(await about.breadcrumbTrail()).toEqual(['Home', 'Editorial History']);
        expect(await about.bodyText()).toBe('Editorial History Page This section lists past contributors.');
        seen.history = {trail: await about.breadcrumbTrail(), body: await about.bodyText()};

        // "Contact": the "Principal Contact" block with the name and a mail
        // link, no "Support Contact" block (Rule 17).
        await about.chooseFromAboutMenu('Contact');
        await expect(about.heading).toHaveText(whole('Contact'));
        const primary = about.contactBlock('primary');
        await expect(primary.heading).toHaveText(whole('Principal Contact'));
        await expect(primary.name).toHaveText(/\S/);
        await expect(primary.emailLink).toHaveText(/^\s*\S+@\S+\s*$/);
        const address = flat(await primary.emailLink.innerText());
        await expect(primary.emailLink).toHaveAttribute('href', `mailto:${address}`);
        await expect(about.contactBlock('support').block).toHaveCount(0);
        seen.contact = {trail: await about.breadcrumbTrail(), body: await about.bodyText()};

        // "Privacy Statement": the default statement (Fields; Rule 18).
        await about.chooseFromAboutMenu('Privacy Statement');
        await expect(about.heading).toHaveText(whole('Privacy Statement'));
        expect(await about.bodyText()).toBe(`Privacy Statement ${DEFAULT_PRIVACY}`);
        seen.privacy = {trail: await about.breadcrumbTrail(), body: await about.bodyText()};

        // The page about the software, from the footer's logo (Rule 20).
        await about.footerLogoLink.click();
        await expect(about.heading).toHaveText(whole('About Open Journal Systems'));
        await expect(about.softwareParagraph()).toHaveText(
            /^\s*This journal uses Open Journal Systems \d+(\.\d+)+, which is open source journal management and publishing software developed, supported, and freely distributed by the Public Knowledge Project under the GNU General Public License\. Visit PKP's website to learn more about the software\. Please contact the journal directly with questions about the journal and submissions to the journal\.\s*$/
        );
        const learnMore = about.softwareParagraph().getByRole('link', {name: 'learn more about the software', exact: true});
        await expect(learnMore).toHaveAttribute('href', /^https?:\/\/pkp\.sfu\.ca\/?$/);
        seen.software = {trail: await about.breadcrumbTrail(), body: await about.bodyText()};
        await about.softwareParagraph().getByRole('link', {name: 'contact the journal', exact: true}).click();
        await expect(about.heading).toHaveText(whole('Contact'));
        expect(visitor.url()).toMatch(new RegExp(`/index\\.php/${JOURNAL}/(en/)?about/contact$`));

        // Control: the Reader, signed in, gets the same heading, breadcrumb
        // and content on each page, and no "Edit" link (Actors rows 4, 5).
        const readerPage = await (await asUser('reader.rosa')).newPage();
        const readerAbout = new AboutPages(readerPage, JOURNAL, {locale: 'en'});
        for (const which of ['about', 'masthead', 'history', 'contact', 'privacy', 'software']) {
            await readerAbout.goto(which);
            expect({trail: await readerAbout.breadcrumbTrail(), body: await readerAbout.bodyText()}, which).toEqual(seen[which]);
            await expect(readerAbout.editLink).toHaveCount(0);
        }
    });

    test('S2: who opens the Settings pages and sees "Edit"', async ({browser, baseURL, asUser}) => {
        test.slow();
        test.setTimeout(360_000);

        // The Journal Manager's side menu: the "Settings" group's five
        // entries, each a page with its heading and a row of tabs (Actors
        // row 1; Rule 1). This is also the scenario's control.
        const managerPage = await (await asUser('manager.maya')).newPage();
        const settings = new SettingsPages(managerPage, JOURNAL, {locale: 'en'});
        await openLanding(managerPage, JOURNAL);
        expect(await settings.settingsGroupItems()).toEqual(SETTINGS.map((s) => s.entry));
        for (const s of SETTINGS) {
            await settings.openSettingsEntry(s.entry);
            await expect(settings.heading).toHaveText(whole(s.heading));
            expect((await settings.topTabNames()).length).toBeGreaterThan(1);
            expect(managerPage.url()).toContain(`/management/settings/${settings.url(s.key).split('/settings/')[1]}`);
        }

        // The "Edit" links: "About the Journal" carries one, read as "Edit"
        // then "Edit About the Journal"; it opens Settings › Journal on
        // "Masthead" in the same window. "Editorial History"'s opens the same
        // tab, "Contact"'s the "Contact" tab; the masthead and the privacy
        // page carry none (Actors row 5; Rule 21).
        const about = new AboutPages(managerPage, JOURNAL, {locale: 'en'});
        const edits = [
            {which: 'about', name: 'Edit About the Journal', tab: 'Masthead', hash: '#masthead'},
            {which: 'history', name: 'Edit Editorial History', tab: 'Masthead', hash: '#masthead'},
            {which: 'contact', name: 'Edit Contact', tab: 'Contact', hash: '#contact'},
        ];
        for (const e of edits) {
            await about.goto(e.which);
            await expect(about.editLink).toHaveCount(1);
            // The name opens with the link's icon glyph, then "Edit".
            await expect(about.editLink).toHaveAccessibleName(new RegExp(`^\\W*Edit\\s+${e.name}$`));
            await expect(about.editLink).not.toHaveAttribute('target', /.+/);
            await about.editLink.click();
            await expect(settings.heading).toHaveText(whole('Journal Settings'));
            await expect(settings.tab(e.tab)).toHaveAttribute('aria-selected', 'true');
            expect(managerPage.url()).toContain(`/management/settings/context${e.hash}`);
        }
        for (const which of ['masthead', 'privacy']) {
            await about.goto(which);
            await expect(about.heading).toBeVisible();
            await expect(about.editLink).toHaveCount(0);
        }

        // Every other role: no "Settings" group, the access-denied page at
        // the five addresses, no "Edit" link on the three pages (Actors rows
        // 1, 5).
        for (const username of ['sectioneditor.ana', 'assistant.rita', 'author.alex', 'reviewer.julia', 'reader.rosa']) {
            await test.step(username, async () => {
                const page = await (await asUser(username)).newPage();
                const theirs = new SettingsPages(page, JOURNAL, {locale: 'en'});
                await openLanding(page, JOURNAL);
                await expect(theirs.settingsGroupHeader).toHaveCount(0);
                for (const s of SETTINGS) {
                    await theirs.gotoExpectingDenied(s.key);
                    await expect(theirs.topTabs).toHaveCount(0);
                }
                const theirAbout = new AboutPages(page, JOURNAL, {locale: 'en'});
                for (const which of ['about', 'history', 'contact']) {
                    await theirAbout.goto(which);
                    await expect(theirAbout.editLink).toHaveCount(0);
                }
                await page.context().close();
            });
        }

        // Signed out: the Login page at the same five addresses (Actors row 1).
        const visitor = await signedOutPage(browser, baseURL);
        const signedOut = new SettingsPages(visitor, JOURNAL, {locale: 'en'});
        for (const s of SETTINGS) {
            await signedOut.gotoExpectingLogin(s.key);
            expect(visitor.url()).toContain('/login');
        }
    });

    test('S3: save the "Masthead" tab', async ({browser, baseURL, asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        await ojsApi.createContext({tag, users: [account(tag, 'mg', 'Mona', 'Manager', ['manager'])]});
        const visitor = await signedOutPage(browser, baseURL);
        const publicPages = new AboutPages(visitor, tag);

        // Control, before the save: "About the Journal" shows its heading
        // alone and the header the journal's former title (Rules 7, 13).
        await publicPages.goto('about');
        expect(await publicPages.bodyText()).toBe('About the Journal');
        await expect(publicPages.headerTitle).toHaveText(whole(`Scratch context ${tag}`));

        const page = await (await asUser(`${tag}mg`)).newPage();
        const settings = new SettingsPages(page, tag);
        const form = await settings.openJournalTab('Masthead');

        // Required boxes left empty: the three flagged, the footer's count
        // and "Go to" buttons, "Jump to next error", "Save" grayed out; no
        // request leaves (Fields).
        const requests = [];
        page.on('request', (r) => {
            if (/\/api\/v1\/contexts\/\d+/.test(r.url()) && r.method() === 'POST') requests.push(r.url());
        });
        await form.control('masthead-name-control').fill('');
        await form.saveButton.click();
        await expect(form.fieldError('masthead-name-control')).toHaveText(whole(REQUIRED));
        await expect(form.fieldError('masthead-acronym-control')).toHaveText(whole(REQUIRED));
        await expect(form.fieldError('masthead-country-control')).toHaveText(whole(REQUIRED));
        await expect(form.errorSummary).toContainText('Please correct 3 errors.');
        await expect(form.goToButtons()).toHaveCount(3);
        await expect(form.goToButton('Go to Journal Initials: This field is required.')).toHaveCount(1);
        await expect(form.goToButton('Go to Country: This field is required.')).toHaveCount(1);
        await expect(form.jumpToErrorButton).toBeVisible();
        await expect(form.saveButton).toBeDisabled();
        expect(requests).toEqual([]);

        // The boxes filled: "Save" stays grayed out until "Country" is chosen.
        await form.control('masthead-name-control').fill('Probe Journal of Identity');
        await form.control('masthead-acronym-control').fill('PJI');
        await expect(form.saveButton).toBeDisabled();
        await form.control('masthead-country-control').selectOption({label: 'Canada'});
        await expect(form.saveButton).toBeEnabled();

        // The texts.
        await form.typeRich('masthead-about-control', 'Our journal publishes probe articles.');
        await form.typeRich('masthead-editorialHistory-control', 'Founded in 2001.');

        // A malformed ISSN and address: refused after the press, with the
        // reasons, the count, "Go to" buttons, "Jump to next error", "Save"
        // grayed out and the page notice (Fields).
        await form.control('masthead-onlineIssn-control').fill('1234-5678');
        await form.control('masthead-publisherUrl-control').fill('example.org');
        const refused = await form.pressSave();
        expect(refused.status()).toBe(400);
        await expect(form.fieldError('masthead-onlineIssn-control')).toHaveText(whole('This is not a valid ISSN.'));
        await expect(form.fieldError('masthead-publisherUrl-control')).toHaveText(whole('This is not a valid URL.'));
        await expect(form.errorSummary).toContainText('Please correct 2 errors.');
        await expect(form.goToButtons()).toHaveCount(2);
        await expect(form.goToButton('Go to Online ISSN: This is not a valid ISSN.')).toHaveCount(1);
        await expect(form.goToButton('Go to URL: This is not a valid URL.')).toHaveCount(1);
        await expect(form.jumpToErrorButton).toBeVisible();
        await expect(form.saveButton).toBeDisabled();
        await expect(
            page.getByText('The form was not saved because 2 error(s) were encountered. Please correct these errors and try again.')
        ).toBeVisible();
        await form.control('masthead-onlineIssn-control').fill('0378-5955');
        await form.control('masthead-publisherUrl-control').fill('https://example.org');

        // Saved.
        await form.save();

        // The public pages, signed out (Rules 7, 13, 16).
        await publicPages.goto('about');
        expect(await publicPages.bodyText()).toBe('About the Journal Our journal publishes probe articles.');
        await expect(publicPages.headerTitle).toHaveText(whole('Probe Journal of Identity'));
        await expect(visitor).toHaveTitle('About the Journal | Probe Journal of Identity');
        await publicPages.goto('history');
        expect(await publicPages.bodyText()).toBe(
            'Editorial History Page This section lists past contributors. Founded in 2001.'
        );
        const site = new AboutPages(visitor, 'index');
        await visitor.goto('/index.php/index');
        await expect(site.siteListEntry(tag)).toHaveText(whole('Probe Journal of Identity'), {timeout: T});
    });

    test('S4: save the "Contact" tab; the journal\'s emails follow the new contact', async ({browser, baseURL, asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(420_000);
        const tag = makeTag('s4', testInfo);
        const author = `${tag}au`;
        const authorEmail = `${author}@mail.test`;
        await ojsApi.createContext({
            tag,
            users: [
                account(tag, 'mg', 'Mona', 'Manager', ['manager']),
                account(tag, 'au', 'Ada', 'Author', ['author']),
            ],
        });
        const {submissionId} = await ojsApi.createSubmission({
            tag: `${tag}s`,
            context: tag,
            submitter: author,
            title: `Submission ${tag}s`,
            decisions: ['sendExternalReview', 'accept', 'sendToProduction'],
        });
        const page = await (await asUser(`${tag}mg`)).newPage();
        await createIssue(page, tag, {volume: '9', number: '9', year: '2099', title: 'Future issue 2099'});

        const visitor = await signedOutPage(browser, baseURL);
        const publicPages = new AboutPages(visitor, tag);
        const primary = publicPages.contactBlock('primary');
        const support = publicPages.contactBlock('support');

        const settings = new SettingsPages(page, tag);
        const form = await settings.openJournalTab('Contact');

        // A phone alone: the support contact's boxes are flagged and
        // nothing is sent (Fields; A3 as the scenario states it).
        const requests = [];
        page.on('request', (r) => {
            if (/\/api\/v1\/contexts\/\d+/.test(r.url()) && r.method() === 'POST') requests.push(r.url());
        });
        await form.control('contact-contactPhone-control').fill('+1 555 0100');
        await form.saveButton.click();
        await expect(form.fieldError('contact-supportName-control')).toHaveText(whole(REQUIRED));
        await expect(form.fieldError('contact-supportEmail-control')).toHaveText(whole(REQUIRED));
        await expect(form.errorSummary).toContainText('Please correct 2 errors.');
        await expect(form.saveButton).toBeDisabled();
        expect(requests).toEqual([]);

        // Control, after the refused save and before "Saved": the
        // "Contact" page, signed out, shows the "Principal Contact" block
        // alone, with the contact the journal was created with and no
        // phone (Rule 17).
        await publicPages.goto('contact');
        await expect(primary.name).toHaveText(whole('Site Admin'));
        await expect(primary.emailLink).toHaveText(whole('admin@mail.test'));
        await expect(primary.phoneValue).toHaveCount(0);
        await expect(support.block).toHaveCount(0);
        await expect(publicPages.contactAddress()).toHaveCount(0);
        expect(await publicPages.bodyText()).toBe('Contact Principal Contact Site Admin admin@mail.test');

        // An invalid address: refused after the press (Fields).
        await form.control('contact-supportName-control').fill('Sam Support');
        await form.control('contact-supportEmail-control').fill('sam.support@mail.test');
        await form.control('contact-contactEmail-control').fill('not-an-email');
        const refused = await form.pressSave();
        expect(refused.status()).toBe(400);
        await expect(form.fieldError('contact-contactEmail-control')).toHaveText(whole('This is not a valid email address.'));
        await expect(form.errorSummary).toContainText('Please correct one error.');
        await expect(form.saveButton).toBeDisabled();
        await expect(
            page.getByText('The form was not saved because 1 error(s) were encountered. Please correct these errors and try again.')
        ).toBeVisible();

        // Saved.
        await form.control('contact-contactName-control').fill('Pat Principal');
        await form.control('contact-contactEmail-control').fill('pat.principal@mail.test');
        await form.control('contact-contactAffiliation-control').fill('Probe University');
        await form.control('contact-mailingAddress-control').fill('1 Probe Street\nProbe City');
        await form.control('contact-supportPhone-control').fill('+1 555 0199');
        await form.save();

        // The "Contact" page, signed out (Rule 17).
        await publicPages.goto('contact');
        expect((await publicPages.contactAddress().innerText()).split('\n').map((l) => l.trim()).filter(Boolean)).toEqual([
            '1 Probe Street',
            'Probe City',
        ]);
        await expect(primary.heading).toHaveText(whole('Principal Contact'));
        await expect(primary.name).toHaveText(whole('Pat Principal'));
        await expect(primary.affiliation).toHaveText(whole('Probe University'));
        await expect(primary.phoneLabel).toHaveText(whole('Phone'));
        await expect(primary.phoneValue).toHaveText(whole('+1 555 0100'));
        await expect(primary.emailLink).toHaveText(whole('pat.principal@mail.test'));
        await expect(primary.emailLink).toHaveAttribute('href', 'mailto:pat.principal@mail.test');
        await expect(support.heading).toHaveText(whole('Support Contact'));
        await expect(support.name).toHaveText(whole('Sam Support'));
        await expect(support.phoneLabel).toHaveText(whole('Phone'));
        await expect(support.phoneValue).toHaveText(whole('+1 555 0199'));
        await expect(support.emailLink).toHaveText(whole('sam.support@mail.test'));
        await expect(support.emailLink).toHaveAttribute('href', 'mailto:sam.support@mail.test');
        expect(await publicPages.bodyText()).toMatch(
            /^Contact 1 Probe Street Probe City Principal Contact Pat Principal Probe University Phone \+1 555 0100 pat\.principal@mail\.test Support Contact Sam Support Phone \+1 555 0199 sam\.support@mail\.test$/
        );

        // A new submission's emails: the Author makes and submits one in the
        // wizard (U21 scenario 2: a draft walked through every step); the
        // acknowledgement to the Author and the "needs an editor" email to
        // the Journal Manager both come from "Pat Principal" at the new
        // address (Rule 9; Side effects).
        const draftTitle = `New submission ${tag}n`;
        const draft = await ojsApi.createSubmission({
            tag: `${tag}n`,
            context: tag,
            submitter: author,
            title: draftTitle,
            submitted: false,
        });
        const authorPage = await (await asUser(author)).newPage();
        const submissionWizard = new SubmissionWizardPage(authorPage, tag);
        await submissionWizard.goto(draft.submissionId);
        await submissionWizard.expectStep('Upload Files');
        await submissionWizard.uploadFile();
        await submissionWizard.continueTo('Details');
        await submissionWizard.continueTo('Contributors');
        await submissionWizard.continueTo('For the Editors');
        await submissionWizard.continueToReview(draft.submissionId);
        await submissionWizard.submitAndConfirm();
        const thanks = await pkpMail.find({to: authorEmail, subject: `Thank you for your submission to Scratch context ${tag}`});
        expect(thanks.From.Name).toBe('Pat Principal');
        expect(thanks.From.Address).toBe('pat.principal@mail.test');
        const needsEditor = await pkpMail.find({
            to: `${tag}mg@mail.test`,
            subject: 'A new submission needs an editor to be assigned',
            contains: draftTitle,
        });
        expect(needsEditor.From.Name).toBe('Pat Principal');
        expect(needsEditor.From.Address).toBe('pat.principal@mail.test');

        // The journal's next email: "Publication Published" to the Author,
        // sent as the journal's title at the new address (Side effects),
        // after a publish by "Assign To Future Issue and Publish
        // Immediately" (U49 Rule 5).
        await publishIntoFutureIssue(page, tag, submissionId, /Vol\. 9 No\. 9 \(2099\)/);
        const published = await pkpMail.find({to: authorEmail, subject: 'Publication Published', contains: tag});
        expect(published.From.Name).toBe(`Scratch context ${tag}`);
        expect(published.From.Address).toBe('pat.principal@mail.test');

        // The password reset, signed out, from the Login page's "Forgot your
        // password?": sent by the site, not by "Pat Principal" (Side effects).
        await visitor.goto(`/index.php/${tag}/login`);
        await visitor.getByRole('link', {name: 'Forgot your password?'}).click();
        await visitor.locator('form#lostPasswordForm input#email').fill(authorEmail);
        await visitor.locator('form#lostPasswordForm').getByRole('button', {name: 'Reset Password'}).click();
        const reset = await pkpMail.find({to: authorEmail, subject: 'Password Reset Confirmation'});
        expect(reset.From.Name).toBe('Open Journal Systems');
        expect(reset.From.Address).toBe('admin@mail.test');
        expect(reset.From.Name).not.toBe('Pat Principal');
    });

    test('S5: change and empty the "Privacy Statement"', async ({browser, baseURL, asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        await ojsApi.createContext({tag, users: [account(tag, 'mg', 'Mona', 'Manager', ['manager'])]});
        const page = await (await asUser(`${tag}mg`)).newPage();
        const settings = new SettingsPages(page, tag);
        const visitor = await signedOutPage(browser, baseURL);
        const publicPages = new AboutPages(visitor, tag);

        // The tab: the default statement; replaced and saved (Fields).
        let form = await settings.openWebsiteSetupTab('privacy');
        expect(words(await form.richContent('privacy-privacyStatement-control'))).toBe(DEFAULT_PRIVACY);
        await form.typeRich('privacy-privacyStatement-control', 'We keep your data in Probe City.');
        await form.save();

        // The page, signed out, from the "About" menu (Rule 18); the
        // manager's view carries no "Edit" link (Rule 21), where "About the
        // Journal" carries one (the control).
        await publicPages.gotoHome();
        await publicPages.chooseFromAboutMenu('Privacy Statement');
        expect(await publicPages.breadcrumbTrail()).toEqual(['Home', 'Privacy Statement']);
        await expect(publicPages.heading).toHaveText(whole('Privacy Statement'));
        expect(await publicPages.bodyText()).toBe('Privacy Statement We keep your data in Probe City.');
        const managerAbout = new AboutPages(page, tag);
        await managerAbout.goto('about');
        await expect(managerAbout.editLink).toHaveCount(1);
        await managerAbout.goto('privacy');
        await expect(managerAbout.heading).toHaveText(whole('Privacy Statement'));
        await expect(managerAbout.editLink).toHaveCount(0);

        // Emptied (Fields).
        form = await settings.openWebsiteSetupTab('privacy');
        await form.typeRich('privacy-privacyStatement-control', '');
        await form.save();

        // The page after: the menu item gone, the address "404 Not Found";
        // the control is the menu read before the box was emptied (above)
        // and "Contact" still in it now (Rules 12, 18).
        await publicPages.gotoHome();
        await publicPages.openAboutMenu();
        await expect(publicPages.aboutItem('Contact')).toBeVisible();
        await expect(publicPages.aboutItem('Privacy Statement')).toHaveCount(0);
        const gone = await visitor.goto(publicPages.url('privacy'));
        expect(gone && gone.status()).toBe(404);
        await expect(visitor.locator('h1')).toHaveText(whole('404 Not Found'));

        // The site's page: "404 Not Found", a fresh site having no statement.
        const sitePage = await visitor.goto('/index.php/index/about/privacy');
        expect(sitePage && sitePage.status()).toBe(404);
        await expect(visitor.locator('h1')).toHaveText(whole('404 Not Found'));
    });

    test('S6: change and empty the Information texts', async ({browser, baseURL, asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s6', testInfo);
        await ojsApi.createContext({
            tag,
            sidebar: ['informationblockplugin'],
            users: [account(tag, 'mg', 'Mona', 'Manager', ['manager'])],
        });
        const page = await (await asUser(`${tag}mg`)).newPage();
        const settings = new SettingsPages(page, tag);
        const visitor = await signedOutPage(browser, baseURL);
        const publicPages = new AboutPages(visitor, tag);

        // The block with the default texts (Rule 19a; Settings bullet 6).
        await publicPages.gotoHome();
        await expect(publicPages.infoBlockHeading).toHaveText(whole('Information'));
        await expect(publicPages.infoBlockLinks).toHaveText([whole('For Readers'), whole('For Authors'), whole('For Librarians')]);

        // The tab: one group "Descriptions" with the three default texts;
        // "For Readers" replaced and saved (Fields).
        let form = await settings.openWebsiteSetupTab('information');
        const group = form.group('Descriptions');
        await expect(group).toBeVisible();
        for (const label of ['For Readers', 'For Authors', 'For Librarians']) {
            await expect(group.getByText(label, {exact: true})).toBeVisible();
        }
        expect(words(await form.richContent('information-readerInformation-control'))).toMatch(
            /^We encourage readers to sign up for the publishing notification service for this journal\. /
        );
        expect(words(await form.richContent('information-authorInformation-control'))).toMatch(
            /^Interested in submitting to this journal\? /
        );
        expect(words(await form.richContent('information-librarianInformation-control'))).toMatch(
            /^We encourage research librarians to list this journal among their library's electronic journal holdings\. /
        );
        await form.typeRich('information-readerInformation-control', 'Readers start here.');
        await form.save();

        // The page, signed out, from the block (Rule 19b).
        await publicPages.gotoHome();
        await publicPages.infoBlockLinks.filter({hasText: whole('For Readers')}).click();
        await expect(publicPages.heading).toHaveText(whole('Information For Readers'));
        expect(await publicPages.bodyText()).toBe('Information For Readers Readers start here.');

        // Its "Edit" link, for the manager: Settings › Website opens on
        // "Setup" › "Information" in the same window (Rule 21).
        const managerAbout = new AboutPages(page, tag);
        await managerAbout.goto('readers');
        await expect(managerAbout.editLink).toHaveCount(1);
        await managerAbout.editLink.click();
        await expect(settings.heading).toHaveText(whole('Website Settings'));
        await expect(settings.tab('Setup')).toHaveAttribute('aria-selected', 'true');
        await expect(settings.selectedSideTab('Setup')).toHaveText(whole('Information'));
        await expect(settings.informationForm().form).toBeVisible();

        // One text emptied: the block keeps the other two; the page opens
        // with its heading alone (Rules 19a, 19b).
        form = await settings.openWebsiteSetupTab('information');
        await form.typeRich('information-librarianInformation-control', '');
        await form.save();
        await publicPages.gotoHome();
        await expect(publicPages.infoBlockLinks).toHaveText([whole('For Readers'), whole('For Authors')]);
        await publicPages.goto('librarians');
        await expect(publicPages.heading).toHaveText(whole('Information For Librarians'));
        expect(await publicPages.bodyText()).toBe('Information For Librarians');

        // Two emptied: the block holds "For Readers" alone (also the
        // control: with one text left the block still shows).
        form = await settings.openWebsiteSetupTab('information');
        await form.typeRich('information-authorInformation-control', '');
        await form.save();
        await publicPages.gotoHome();
        await expect(publicPages.infoBlockHeading).toHaveText(whole('Information'));
        await expect(publicPages.infoBlockLinks).toHaveText([whole('For Readers')]);
        // The About pages carry the same block while a text is left (the
        // control for their reads below).
        await publicPages.goto('about');
        await expect(publicPages.infoBlockLinks).toHaveText([whole('For Readers')]);

        // All three emptied: no "Information" block on the home page or the
        // About pages (Rule 19a).
        form = await settings.openWebsiteSetupTab('information');
        await form.typeRich('information-readerInformation-control', '');
        await form.save();
        await publicPages.gotoHome();
        await expect(publicPages.main).toBeVisible();
        await expect(publicPages.infoBlock).toHaveCount(0);
        for (const which of ['about', 'masthead', 'contact', 'privacy']) {
            await publicPages.goto(which);
            await expect(publicPages.infoBlock).toHaveCount(0);
        }
    });

    test('S7: who "Editorial Masthead" and "Editorial History" list', async ({browser, baseURL, ojsApi}, testInfo) => {
        const tag = makeTag('s7', testInfo);
        const mikeOrcid = 'https://orcid.org/0000-0002-1825-0097';
        await ojsApi.createContext({
            tag,
            users: [
                account(tag, 'z', 'Zed', 'Zulu', ['sectionEditor']),
                account(tag, 'a', 'Al', 'Alpha', ['sectionEditor']),
                account(tag, 'm', 'Max', 'Mike', ['sectionEditor'], {
                    affiliation: 'Masthead University',
                    orcid: mikeOrcid,
                    orcidIsVerified: true,
                }),
                account(tag, 'f', 'Fay', 'Fourth', ['sectionEditor', 'editorialBoardMember'], {masthead: {sectionEditor: false}}),
                account(tag, 'p', 'Pat', 'Past', ['reader'], {
                    affiliation: 'Past University',
                    pastRoles: [{role: 'sectionEditor', dateStart: '2019-01-01', dateEnd: '2024-12-31'}],
                }),
                account(tag, 'q', 'Quin', 'Twice', ['reader'], {
                    pastRoles: [
                        {role: 'sectionEditor', dateStart: '2015-01-01', dateEnd: '2016-12-31'},
                        {role: 'sectionEditor', dateStart: '2020-01-01', dateEnd: '2022-12-31'},
                    ],
                }),
            ],
        });
        const visitor = await signedOutPage(browser, baseURL);
        const about = new AboutPages(visitor, tag);

        // The role headings (Rules 14a, 14b).
        await about.goto('masthead');
        await expect(about.listHeadings()).toHaveText([whole('Section editor'), whole('Editorial Board Member')]);
        await expect(about.listHeading('Journal editor')).toHaveCount(0);

        // The Section editors by family name, this year and a dash, Mike's
        // affiliation and ORCID icon; no picture, no email (Rules 14b, 14c).
        expect(await about.listNames('Section editor')).toEqual(['Al Alpha', 'Max Mike', 'Zed Zulu']);
        const entries = about.listEntries('Section editor');
        for (let i = 0; i < 3; i++) {
            const parts = about.entryParts(entries.nth(i));
            await expect(parts.dateStart).toHaveText(new RegExp(`^\\s*${THIS_YEAR} –\\s*$`));
            await expect(parts.pictures).toHaveCount(0);
            await expect(parts.emailLinks).toHaveCount(0);
            expect(await entries.nth(i).innerText()).not.toContain('@');
        }
        const mike = about.entryParts(about.listEntry('Section editor', 'Max Mike'));
        await expect(mike.affiliation).toHaveText(whole('Masthead University'));
        await expect(mike.orcidLink).toHaveAttribute('href', mikeOrcid);
        await expect(mike.orcidLink).toHaveAttribute('target', '_blank');
        await expect(about.entryParts(about.listEntry('Section editor', 'Zed Zulu')).orcidLink).toHaveCount(0);

        // The member who does not appear is not under "Section editor"
        // (Rule 14b); the control: listed under "Editorial Board Member".
        expect(await about.listNames('Section editor')).not.toContain('Fay Fourth');
        expect(await about.listNames('Editorial Board Member')).toEqual(['Fay Fourth']);

        // The history: the past Section editors with their periods, the
        // latest first, and the affiliation; nobody still serving (Rule 16).
        await about.historyLink().click();
        await expect(about.heading).toHaveText(whole('Editorial History Page'));
        await expect(about.listHeadings()).toHaveText([whole('Section editor')]);
        expect(await about.listNames('Section editor')).toEqual(['Pat Past', 'Quin Twice']);
        const past = about.entryParts(about.listEntry('Section editor', 'Pat Past'));
        await expect(past.dateStart).toHaveText(whole('2019 – 2024'));
        await expect(past.affiliation).toHaveText(whole('Past University'));
        const twice = about.entryParts(about.listEntry('Section editor', 'Quin Twice'));
        await expect(twice.dateStart).toHaveText(whole('2020 – 2022, 2015 – 2016'));
        await expect(twice.affiliation).toHaveCount(0);
    });

    test('S8: changes to the team show at the next load', async ({browser, baseURL, asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(540_000);
        const tag = makeTag('s8', testInfo);
        const email = (suffix) => `${tag}${suffix}@mail.test`;
        await ojsApi.createContext({
            tag,
            users: [
                account(tag, 'mg', 'Mona', 'Manager', ['manager']),
                account(tag, 'ab', 'Ann', 'Able', ['sectionEditor', 'reader']),
                account(tag, 'ba', 'Ben', 'Baker', ['sectionEditor']),
                account(tag, 'ca', 'Cal', 'Carter', ['sectionEditor']),
                account(tag, 'fo', 'Flo', 'Ford', ['editorialBoardMember']),
                account(tag, 'gr', 'Gus', 'Grant', ['editorialBoardMember']),
                account(tag, 'hi', 'Hal', 'Hill', ['editorialBoardMember']),
                account(tag, 'du', 'Dee', 'Dunn', ['reader']),
                account(tag, 'ir', 'Ivy', 'Irwin', ['reader']),
                account(tag, 'ev', 'Eve', 'Evans', ['author']),
            ],
        });
        const visitor = await signedOutPage(browser, baseURL);
        const about = new AboutPages(visitor, tag);
        const page = await (await asUser(`${tag}mg`)).newPage();
        const usersRoles = new UsersRolesPage(page, tag);
        const wizard = new SendInvitationWizard(page);
        const list = new UsersListPage(page, tag);
        const HISTORY_EMPTY = 'Editorial History Page This section lists past contributors.';
        const SE = 'Section editor';
        const EBM = 'Editorial Board Member';
        const mail = {browser, baseURL, pkpMail};

        // Before: the three Section editors and the three Editorial Board
        // Members, no "Author" heading; nobody on the history page (Rules
        // 14a, 16).
        await about.goto('masthead');
        await expect(about.listHeadings()).toHaveText([whole(SE), whole(EBM)]);
        expect(await about.listNames(SE)).toEqual(['Ann Able', 'Ben Baker', 'Cal Carter']);
        expect(await about.listNames(EBM)).toEqual(['Flo Ford', 'Gus Grant', 'Hal Hill']);
        await expect(about.listHeading('Author')).toHaveCount(0);
        await about.goto('history');
        expect(await about.bodyText()).toBe(HISTORY_EMPTY);

        // A role given: Dunn invited to the Section editor role from today,
        // set to appear, and accepting from the mailbox (Rules 14b, 14e).
        await inviteAndAccept(page, tag, mail, {
            email: email('du'),
            role: SE,
            startDate: today(),
            masthead: 'Appear on the masthead',
            subject: `Invitation${tag}du`,
        });
        await about.goto('masthead');
        expect(await about.listNames(SE)).toEqual(['Ann Able', 'Ben Baker', 'Cal Carter', 'Dee Dunn']);
        await expect(about.entryParts(about.listEntry(SE, 'Dee Dunn')).dateStart).toHaveText(
            new RegExp(`^\\s*${THIS_YEAR} –\\s*$`)
        );

        // "Remove Role" on Able's Section editor role: off the masthead, onto
        // the history with this year on both sides (Rules 14e, 16).
        await usersRoles.goto();
        await usersRoles.rowAction(usersRoles.userRow(email('ab')), /^Edit$/);
        await expect(wizard.stepHeading(/Enter details/)).toBeVisible({timeout: T});
        await wizard.removeRoleButton(wizard.currentRoleRow(SE)).click();
        await expect(wizard.removeRoleDialog).toBeVisible();
        const ended = page.waitForResponse((r) => r.url().includes('/endRole/'));
        await wizard.removeRoleDialog.getByRole('button', {name: 'Remove Role'}).click();
        expect((await ended).status()).toBe(200);
        await expect(wizard.removeRoleDialog).toBeHidden();
        await about.goto('masthead');
        expect(await about.listNames(SE)).toEqual(['Ben Baker', 'Cal Carter', 'Dee Dunn']);
        await about.goto('history');
        await expect(about.listHeadings()).toHaveText([whole(SE)]);
        expect(await about.listNames(SE)).toEqual(['Ann Able']);
        await expect(about.entryParts(about.listEntry(SE, 'Ann Able')).dateStart).toHaveText(
            whole(`${THIS_YEAR} – ${THIS_YEAR}`)
        );

        // The masthead choice: Baker set to "Does not appear on the
        // masthead": off the masthead and not on the history (Rule 14e;
        // Settings bullet 3).
        await usersRoles.goto();
        await usersRoles.rowAction(usersRoles.userRow(email('ba')), /^Edit$/);
        await expect(wizard.stepHeading(/Enter details/)).toBeVisible({timeout: T});
        await wizard.mastheadSelect(wizard.currentRoleRow(SE)).selectOption({label: 'Does not appear on the masthead'});
        await expect(wizard.mastheadDialog).toBeVisible();
        const chosen = page.waitForResponse((r) => r.url().includes('/masthead/'));
        await wizard.mastheadDialog.getByRole('button', {name: 'Confirm'}).click();
        expect((await chosen).status()).toBe(200);
        await expect(wizard.mastheadDialog).toBeHidden();
        await about.goto('masthead');
        expect(await about.listNames(SE)).toEqual(['Cal Carter', 'Dee Dunn']);
        await about.goto('history');
        expect(await about.listNames(SE)).toEqual(['Ann Able']);

        // A later start date: Irwin invited as Dunn was, starting 30 days
        // from today, and accepting; the masthead does not list Irwin, while
        // Dunn, who started today, stays listed (Rule 14e).
        await inviteAndAccept(page, tag, mail, {
            email: email('ir'),
            role: SE,
            startDate: today(30),
            masthead: 'Appear on the masthead',
            subject: `Invitation${tag}ir`,
        });
        await about.goto('masthead');
        expect(await about.listNames(SE)).toEqual(['Cal Carter', 'Dee Dunn']);
        expect(await about.bodyText()).not.toContain('Ivy Irwin');

        // "Remove User" on Ford: off the masthead, onto the history under
        // "Editorial Board Member" (Rule 14e).
        await list.goto();
        await list.chooseAction(list.row(email('fo')), 'Remove User');
        const remove = new RemoveUserDialog(page);
        await remove.expectOpen();
        expect((await remove.ok()).status()).toBe(200);
        await about.goto('masthead');
        expect(await about.listNames(EBM)).toEqual(['Gus Grant', 'Hal Hill']);
        await about.goto('history');
        await expect(about.listHeadings()).toHaveText([whole(SE), whole(EBM)]);
        expect(await about.listNames(EBM)).toEqual(['Flo Ford']);

        // "Disable User" on Grant, then on Ford, whose row stays on the list:
        // Grant stays on the masthead and Ford on the history (Rule 14e).
        for (const [suffix, name] of [['gr', 'Gus Grant'], ['fo', 'Flo Ford']]) {
            await list.goto();
            const row = list.row(email(suffix));
            await list.chooseAction(row, 'Disable User');
            const disable = new DisableUserWindow(page, `Disable ${name}`);
            await disable.expectForm();
            await disable.ok();
            await expect(list.disabledIcon(row)).toHaveCount(1, {timeout: T});
        }
        await about.goto('masthead');
        expect(await about.listNames(EBM)).toEqual(['Gus Grant', 'Hal Hill']);
        await about.goto('history');
        expect(await about.listNames(EBM)).toEqual(['Flo Ford']);

        // "Merge user": Hill merged into Evans, Evans's account kept: Evans
        // listed under "Editorial Board Member", Hill gone (Rule 14e).
        await list.goto();
        await list.chooseAction(list.row(email('hi')), 'Merge user');
        const merge = new MergeUserWindow(page);
        await merge.expectOpen();
        await merge.mergeInto(email('ev'));
        expect((await merge.confirm()).status()).toBe(200);
        await merge.expectClosed();
        await about.goto('masthead');
        expect(await about.listNames(EBM)).toEqual(['Eve Evans', 'Gus Grant']);
        expect(await about.bodyText()).not.toContain('Hal Hill');

        // "Consider role in masthead list" ticked on the Author role: an
        // "Author" heading with Evans (Rule 14e; Settings bullet 2).
        const roles = new RolesTab(page, tag);
        await roles.setRoleBox('Author', MASTHEAD_BOX, true);
        await about.goto('masthead');
        await expect(about.listHeading('Author')).toHaveCount(1);
        expect(await about.listNames('Author')).toEqual(['Eve Evans']);

        // Unticked on the Section editor role: the heading and Carter and
        // Dunn gone; the history no longer lists Able, while Ford stays
        // under "Editorial Board Member" (Rule 14e; Settings bullet 2).
        // Control: the "Author" heading with Evans stays.
        await roles.setRoleBox(SE, MASTHEAD_BOX, false);
        await about.goto('masthead');
        await expect(about.listHeading('Author')).toHaveCount(1);
        expect(await about.listNames('Author')).toEqual(['Eve Evans']);
        await expect(about.listHeading(SE)).toHaveCount(0);
        const mastheadText = await about.bodyText();
        expect(mastheadText).not.toContain('Cal Carter');
        expect(mastheadText).not.toContain('Dee Dunn');
        await about.goto('history');
        await expect(about.listHeadings()).toHaveText([whole(EBM)]);
        expect(await about.listNames(EBM)).toEqual(['Flo Ford']);
        expect(await about.bodyText()).not.toContain('Ann Able');
    });

    test('S9: "Peer Reviewers in Previous Year"', async ({browser, baseURL, asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s9', testInfo);
        const zetaOrcid = 'https://orcid.org/0000-0002-1694-233X';
        const PEERS = 'Peer Reviewers in Previous Year';
        // A new context arrives with "Enable listing of reviewers on the
        // masthead" unticked (Settings bullet 4c; footnote ad).
        await ojsApi.createContext({
            tag,
            users: [
                account(tag, 'mg', 'Mona', 'Manager', ['manager']),
                account(tag, 'au', 'Ada', 'Author', ['author']),
                account(tag, 'ze', 'Zoe', 'Zeta', ['externalReviewer'], {
                    affiliation: 'Review University',
                    orcid: zetaOrcid,
                    orcidIsVerified: true,
                }),
                account(tag, 'be', 'Bob', 'Beta', ['externalReviewer']),
                account(tag, 'ga', 'Gil', 'Gamma', ['externalReviewer']),
            ],
        });
        const lastYearDay = `${LAST_YEAR}-06-15`;
        for (const [suffix, dateCompleted] of [['ze', lastYearDay], ['be', lastYearDay], ['ga', null]]) {
            const reviewer = {username: `${tag}${suffix}`, status: 'completed'};
            if (dateCompleted) reviewer.dateCompleted = dateCompleted;
            await ojsApi.createSubmission({
                tag: `${tag}${suffix}s`,
                context: tag,
                submitter: `${tag}au`,
                decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [reviewer]}],
            });
        }
        const visitor = await signedOutPage(browser, baseURL);
        const about = new AboutPages(visitor, tag);
        const page = await (await asUser(`${tag}mg`)).newPage();
        const usersRoles = new UsersRolesPage(page, tag);
        const wizard = new SendInvitationWizard(page);

        /** Beta's Reviewer row on Beta's "Edit" page (Settings bullet 3). */
        async function betaReviewerRow() {
            await usersRoles.goto();
            await usersRoles.rowAction(usersRoles.userRow(`${tag}be@mail.test`), /^Edit$/);
            await expect(wizard.stepHeading(/Enter details/)).toBeVisible({timeout: T});
            await expect(page.getByRole('columnheader', {name: 'Journal Masthead'})).toBeVisible();
            const row = wizard.currentRoleRow('Reviewer');
            await expect(row).toHaveCount(1);
            await expect(row.getByRole('combobox')).toHaveCount(0);
            return row;
        }

        // The box at its default: the page ends with the history line and
        // the rule, no heading and no sentence after them, though Beta and
        // Zeta submitted reviews last year (Rule 15; Settings bullet 4c).
        await about.goto('masthead');
        await expect(about.historyLine()).toHaveText(/^\s*View\s+Editorial History\s*$/);
        await expect(about.rule()).toHaveCount(1);
        await expect(about.main.locator('.page_masthead > hr ~ *')).toHaveCount(0);
        await expect(about.listHeading(PEERS)).toHaveCount(0);
        expect(await about.bodyText()).not.toContain('The editors express their appreciation of the reviewers');

        // Beta's Reviewer row, reviewers not listed: "Does not appear on the
        // masthead" (Settings bullet 3).
        let row = await betaReviewerRow();
        await expect(row).toContainText('Does not appear on the masthead');
        await expect(row.getByText('Appear on the masthead', {exact: true})).toHaveCount(0);

        // The box ticked on Settings › Website › "Appearance" › "Editorial
        // Masthead" and saved (Settings bullet 4c).
        const website = new WebsiteSettings(page, tag);
        await website.goto();
        const masthead = await website.open('appearance-masthead');
        await expect(masthead.reviewersBox).not.toBeChecked();
        await masthead.reviewersBox.check();
        await masthead.save();

        // Beta's Reviewer row, reviewers listed: "Appear on the masthead"
        // (Settings bullet 3).
        row = await betaReviewerRow();
        await expect(row.getByText('Appear on the masthead', {exact: true})).toBeVisible();
        await expect(row).not.toContainText('Does not appear on the masthead');

        // The block after the rule: heading, sentence with last year, Beta
        // and Zeta by family name with no year; Zeta's affiliation and ORCID
        // icon (Rules 14c, 15).
        await about.goto('masthead');
        await expect(about.historyLine()).toBeVisible();
        const afterRule = about.main.locator('.page_masthead > hr ~ h2');
        await expect(afterRule).toHaveText([whole(PEERS)]);
        await expect(
            about.paragraph(`The editors express their appreciation of the reviewers for ${LAST_YEAR} listed below.`)
        ).toHaveCount(1);
        expect(await about.listNames(PEERS)).toEqual(['Bob Beta', 'Zoe Zeta']);
        await expect(about.listEntries(PEERS).locator('.date_start')).toHaveCount(0);
        const zeta = about.entryParts(about.listEntry(PEERS, 'Zoe Zeta'));
        await expect(zeta.affiliation).toHaveText(whole('Review University'));
        await expect(zeta.orcidLink).toHaveAttribute('href', zetaOrcid);
        await expect(zeta.orcidLink).toHaveAttribute('target', '_blank');

        // Control: Gamma, whose review was submitted this year, is not
        // listed while Beta and Zeta are (Rule 15).
        expect(await about.listNames(PEERS)).not.toContain('Gil Gamma');
        expect(await about.bodyText()).not.toContain('Gil Gamma');

        // A listed reviewer disabled: Beta disabled with "Disable User" stays
        // listed (Rule 14e).
        const list = new UsersListPage(page, tag);
        await list.goto();
        const betaRow = list.row(`${tag}be@mail.test`);
        await list.chooseAction(betaRow, 'Disable User');
        const disable = new DisableUserWindow(page, 'Disable Bob Beta');
        await disable.expectForm();
        await disable.ok();
        await expect(list.disabledIcon(betaRow)).toHaveCount(1, {timeout: T});
        await about.goto('masthead');
        await expect(afterRule).toHaveText([whole(PEERS)]);
        expect(await about.listNames(PEERS)).toEqual(['Bob Beta', 'Zoe Zeta']);
    });

    test('S10: a journal not accepting submissions', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        await ojsApi.createContext({tag, users: [account(tag, 'mg', 'Mona', 'Manager', ['manager'])]});
        const page = await (await asUser(`${tag}mg`)).newPage();
        const settings = new SettingsPages(page, tag);

        // Control, before the box is ticked: no notice on Settings › Journal.
        await settings.goto('journal');
        await expect(settings.heading).toHaveText(whole('Journal Settings'));
        await expect(settings.mainRegion.getByText(NOT_ACCEPTING)).toHaveCount(0);

        // Disabled (Rule 4a).
        let form = await settings.openDisableSubmissions();
        await form.form.getByRole('checkbox', {name: 'Disable Submissions'}).check();
        await form.save();

        // The four pages carry the notice above their tabs (Rule 4a).
        for (const key of ['journal', 'website', 'workflow', 'distribution']) {
            await settings.goto(key);
            const notice = settings.mainRegion.getByText(NOT_ACCEPTING);
            await expect(notice).toHaveCount(1);
            await expect(notice).toBeVisible();
            // Above the tabs: the notice comes before the tab row in the page.
            const before = await notice.evaluate((n) => {
                const tablist = document.querySelector('main [role="tablist"]');
                return !!tablist && !!(n.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING);
            });
            expect(before, `${key}: the notice sits above the tabs`).toBe(true);
        }

        // "Users & Roles": no notice (Rule 4a).
        await settings.goto('usersRoles');
        await expect(settings.heading).toHaveText(whole('Users & Roles'));
        await expect(settings.mainRegion.getByText(NOT_ACCEPTING)).toHaveCount(0);

        // Allowed again: gone from Settings › Journal on its next load (Rule
        // 4a; A8 is the open page, not read here).
        form = await settings.openDisableSubmissions();
        await form.form.getByRole('checkbox', {name: 'Disable Submissions'}).uncheck();
        await form.save();
        await settings.goto('journal');
        await expect(settings.heading).toHaveText(whole('Journal Settings'));
        await expect(settings.mainRegion.getByText(NOT_ACCEPTING)).toHaveCount(0);
    });

    test('S11: an Editor whose role may not change the Settings', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s11', testInfo);
        await ojsApi.createContext({
            tag,
            roles: {editor: {permitSettings: false}},
            users: [
                account(tag, 'ed', 'Eli', 'Editor', ['editor']),
                account(tag, 'pe', 'Pia', 'Producer', ['productionEditor']),
            ],
        });

        // The Editor: no "Settings" group; the access-denied page at the
        // five addresses (Settings bullet 1); the "Edit" links still shown
        // on the three pages (Actors row 5; A2 as the scenario states it).
        const editorPage = await (await asUser(`${tag}ed`)).newPage();
        const editorSettings = new SettingsPages(editorPage, tag);
        await openLanding(editorPage, tag);
        await expect(editorSettings.nav.locator('[role="button"][aria-controls]').first()).toBeVisible();
        await expect(editorSettings.settingsGroupHeader).toHaveCount(0);
        for (const s of SETTINGS) {
            await editorSettings.gotoExpectingDenied(s.key);
            await expect(editorSettings.topTabs).toHaveCount(0);
        }
        const editorAbout = new AboutPages(editorPage, tag);
        for (const which of ['about', 'history', 'contact']) {
            await editorAbout.goto(which);
            await expect(editorAbout.editLink).toHaveCount(1);
            await expect(editorAbout.editLink).toBeVisible();
        }

        // Control: the Production editor holds the "Settings" group and
        // opens the five pages (Actors row 1).
        const pePage = await (await asUser(`${tag}pe`)).newPage();
        const peSettings = new SettingsPages(pePage, tag);
        await openLanding(pePage, tag);
        expect(await peSettings.settingsGroupItems()).toEqual(SETTINGS.map((s) => s.entry));
        for (const s of SETTINGS) {
            await peSettings.goto(s.key);
            await expect(peSettings.heading).toHaveText(whole(s.heading));
            await expect(peSettings.deniedMessage).toHaveCount(0);
        }
    });
    test('S13: a masthead not based on enrollments', async ({browser, baseURL, asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(420_000);
        const tag = makeTag('s13', testInfo);
        const SE = 'Section editor';
        const ENROLLED = 'Editorial History Page This section lists past contributors.';
        await ojsApi.createContext({
            tag,
            context: {acronym: 'PMT', country: 'CA'},
            users: [
                account(tag, 'mg', 'Mona', 'Manager', ['manager']),
                account(tag, 'ab', 'Ann', 'Able', ['sectionEditor']),
                account(tag, 'co', 'Cy', 'Cole', ['reader']),
                account(tag, 'da', 'Dot', 'Dale', ['reader'], {
                    pastRoles: [{role: 'sectionEditor', dateStart: '2019-01-01', dateEnd: '2024-12-31'}],
                }),
            ],
        });
        const visitor = await signedOutPage(browser, baseURL);
        const about = new AboutPages(visitor, tag);
        const page = await (await asUser(`${tag}mg`)).newPage();
        const managerAbout = new AboutPages(page, tag);
        const settings = new SettingsPages(page, tag);
        const website = new WebsiteSettings(page, tag);
        const roles = new RolesTab(page, tag);
        const usersRoles = new UsersRolesPage(page, tag);
        const wizard = new SendInvitationWizard(page);
        const mastheadHeader = page.getByRole('columnheader', {name: 'Journal Masthead'});
        const startHeader = page.getByRole('columnheader', {name: 'Start Date'});

        // Before: Able under "Section editor", then "View Editorial
        // History"; its link opens the history page listing Dale under
        // "Section editor" with "2019 – 2024" (Rules 14, 16).
        await about.goto('masthead');
        await expect(about.listHeadings()).toHaveText([whole(SE)]);
        expect(await about.listNames(SE)).toEqual(['Ann Able']);
        await expect(about.historyLine()).toHaveText(/^\s*View\s+Editorial History\s*$/);
        await about.historyLink().click();
        await expect(about.heading).toHaveText(whole('Editorial History Page'));
        const historyAddress = visitor.url();
        expect(historyAddress).toMatch(/\/about\/editorialHistory$/);
        expect(await about.listNames(SE)).toEqual(['Dot Dale']);
        await expect(about.entryParts(about.listEntry(SE, 'Dot Dale')).dateStart).toHaveText(whole('2019 – 2024'));

        // The box unticked: the "Editorial Masthead" list and "Reviewers"
        // leave the tab at once, before any save (the enrollment group
        // stays, the control); then "Save" (Settings bullet 4a).
        await website.goto();
        let masthead = await website.open('appearance-masthead');
        await expect(masthead.enrollmentBox).toBeChecked();
        await expect(masthead.description).toBeVisible();
        await expect(masthead.reviewersBox).toHaveCount(1);
        await masthead.enrollmentBox.uncheck();
        await expect(masthead.description).toHaveCount(0);
        await expect(masthead.reviewersField).toHaveCount(0);
        await expect(masthead.enrollmentBox).not.toBeChecked();
        await masthead.save();

        // The masthead, its text empty: under the heading the "Edit" link
        // alone; no role heading, no Able, no history line, no rule (Rules
        // 14f, 21).
        await managerAbout.goto('masthead');
        await expect(managerAbout.heading).toHaveText(whole('Editorial Masthead'));
        await expect(managerAbout.editLink).toHaveCount(1);
        await expect(managerAbout.editLink).toHaveAccessibleName(/^\W*Edit\s+Edit Editorial Masthead$/);
        expect(await managerAbout.bodyText()).toBe('Editorial Masthead Edit Edit Editorial Masthead');
        await expect(managerAbout.listHeadings()).toHaveCount(0);
        await expect(managerAbout.historyLine()).toHaveCount(0);
        await expect(managerAbout.rule()).toHaveCount(0);

        // Its "Edit" link: Settings › Journal on "Masthead" in the same
        // window (Rule 21); "Founded in 2001." typed in "Editorial History"
        // and saved (Fields).
        await expect(managerAbout.editLink).not.toHaveAttribute('target', /.+/);
        await managerAbout.editLink.click();
        await expect(settings.heading).toHaveText(whole('Journal Settings'));
        await expect(settings.tab('Masthead')).toHaveAttribute('aria-selected', 'true');
        expect(page.url()).toContain('/management/settings/context#masthead');
        const form = settings.mastheadForm();
        await form.ready();
        await form.typeRich('masthead-editorialHistory-control', 'Founded in 2001.');
        await form.save();

        // The masthead with its text, signed out: "Founded in 2001." and
        // nothing else, no "Edit" link (Rule 14f); the manager's view of the
        // same page carries it (the control, above).
        await about.goto('masthead');
        expect(await about.bodyText()).toBe('Editorial Masthead Founded in 2001.');
        await expect(about.editLink).toHaveCount(0);
        await expect(about.listHeadings()).toHaveCount(0);

        // The "Editorial History" address: "Editorial Masthead" opens in its
        // place, signed out and for the Journal Manager (Rule 14f).
        for (const [who, p] of [['signed out', about], ['manager', managerAbout]]) {
            await p.page.goto(historyAddress);
            await expect(p.heading, who).toHaveText(whole('Editorial Masthead'));
            await expect(p.page, who).toHaveURL(/\/about\/editorialMasthead$/);
            expect(await p.bodyText(), who).toContain('Founded in 2001.');
        }

        // The role window: no "Consider role in masthead list" box (Settings
        // bullet 2); "Permit changes to Settings" is there (the control).
        await roles.goto();
        await roles.openRoleWindow(SE);
        await expect(roles.box('Permit changes to Settings')).toHaveCount(1);
        await expect(roles.box(MASTHEAD_BOX)).toHaveCount(0);

        // The user's "Edit" page: Able's roles table has no masthead column
        // and no masthead choice (Settings bullet 3).
        await usersRoles.goto();
        await usersRoles.rowAction(usersRoles.userRow(`${tag}ab@mail.test`), /^Edit$/);
        await expect(wizard.stepHeading(/Enter details/)).toBeVisible({timeout: T});
        await expect(startHeader).toBeVisible();
        await expect(wizard.currentRoleRow(SE)).toHaveCount(1);
        await expect(mastheadHeader).toHaveCount(0);
        await expect(wizard.currentRoleRow(SE).getByRole('combobox')).toHaveCount(0);
        await expect(page.locator('main')).not.toContainText(/appear on the masthead/i);

        // "Invite to a role" and Cole's side: the role row has no masthead
        // column; the email says nothing about the masthead; the review
        // step has no masthead column (Settings bullet 3).
        const mailText = await inviteAndAccept(page, tag, {browser, baseURL, pkpMail}, {
            email: `${tag}co@mail.test`,
            role: SE,
            startDate: today(),
            masthead: null,
            subject: `Invitation${tag}co`,
            onDetails: async (w) => {
                await expect(startHeader).toBeVisible();
                await expect(mastheadHeader).toHaveCount(0);
                await expect(w.newRoleRow().getByRole('combobox')).toHaveCount(1);
                await expect(page.locator('main')).not.toContainText(/appear on the masthead/i);
            },
            onReview: async (accept, inviteePage) => {
                await expect(inviteePage.getByRole('columnheader', {name: 'Start Date'})).toBeVisible();
                await expect(inviteePage.getByRole('row').filter({hasText: SE})).toHaveCount(1);
                await expect(inviteePage.getByRole('columnheader', {name: 'Journal Masthead'})).toHaveCount(0);
                await expect(inviteePage.locator('main')).not.toContainText(/masthead/i);
            },
        });
        expect(flat(mailText)).toContain(`Newly assigned roles`);
        expect(flat(mailText)).toMatch(new RegExp(`${SE} -* Starting from ${today()}`));
        expect(mailText).not.toMatch(/masthead/i);

        // Ticked again: the masthead lists Able and the history line as
        // before, Cole not listed; "Editorial History" opens again with Dale
        // and "Founded in 2001." below the list (Rules 14f, 16; Settings
        // bullet 3).
        await website.goto();
        masthead = await website.open('appearance-masthead');
        await masthead.enrollmentBox.check();
        await expect(masthead.description).toBeVisible();
        await masthead.save();
        await about.goto('masthead');
        await expect(about.listHeadings()).toHaveText([whole(SE)]);
        expect(await about.listNames(SE)).toEqual(['Ann Able']);
        await expect(about.historyLine()).toHaveText(/^\s*View\s+Editorial History\s*$/);
        expect(await about.bodyText()).not.toContain('Cy Cole');
        await about.historyLink().click();
        await expect(about.heading).toHaveText(whole('Editorial History Page'));
        expect(visitor.url()).toBe(historyAddress);
        expect(await about.listNames(SE)).toEqual(['Dot Dale']);
        await expect(about.entryParts(about.listEntry(SE, 'Dot Dale')).dateStart).toHaveText(whole('2019 – 2024'));
        const historyText = await about.bodyText();
        expect(historyText.startsWith(`${ENROLLED} `)).toBe(true);
        expect(historyText).toMatch(/Dot Dale.* Founded in 2001\.$/);

        // Cole's masthead choice: "Does not appear on the masthead", the
        // choice the invitation sent (Settings bullet 3).
        await usersRoles.goto();
        await usersRoles.rowAction(usersRoles.userRow(`${tag}co@mail.test`), /^Edit$/);
        await expect(wizard.stepHeading(/Enter details/)).toBeVisible({timeout: T});
        await expect(mastheadHeader).toBeVisible();
        const coleSelect = wizard.mastheadSelect(wizard.currentRoleRow(SE));
        await expect(coleSelect.locator('option:checked')).toHaveText(whole('Does not appear on the masthead'));

        // Control: the "Section editor" role window holds "Consider role in
        // masthead list" again (Settings bullet 2).
        await roles.goto();
        await roles.openRoleWindow(SE);
        await expect(roles.box(MASTHEAD_BOX)).toHaveCount(1);
    });

    test('S14: a published article keeps the journal\'s name of its day', async ({browser, baseURL, asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s14', testInfo);
        const author = `${tag}au`;
        const PAST_ISSUE = {volume: 1, number: 1, year: 2026};
        await ojsApi.createContext({
            tag,
            context: {name: 'Old Probe Journal', acronym: 'OPJ', country: 'CA'},
            plugins: {citationstylelanguageplugin: {enabled: true}},
            issues: [
                {...PAST_ISSUE, published: true},
                {volume: 9, number: 9, year: 2099},
            ],
            users: [
                account(tag, 'mg', 'Mona', 'Manager', ['manager']),
                account(tag, 'au', 'Ada', 'Author', ['author']),
            ],
        });
        const first = await ojsApi.createSubmission({
            tag: `${tag}a`,
            context: tag,
            submitter: author,
            title: 'First Probe Article',
            published: true,
            issue: PAST_ISSUE,
        });
        const second = await ojsApi.createSubmission({
            tag: `${tag}b`,
            context: tag,
            submitter: author,
            title: 'Second Probe Article',
            decisions: ['sendExternalReview', 'accept', 'sendToProduction'],
        });
        const visitor = await signedOutPage(browser, baseURL);
        const landing = new ArticleLandingPage(visitor, tag);
        const header = visitor.locator('.pkp_site_name');

        // Control, before the save: the first article's header reads "Old
        // Probe Journal" (Rule 7).
        await landing.goto(first.submissionId);
        await expect(header).toHaveText(whole('Old Probe Journal'));
        await expect(landing.citation()).toContainText('Old Probe Journal');

        // The rename: "New Probe Journal" and "NPJ", saved (Fields).
        const page = await (await asUser(`${tag}mg`)).newPage();
        const settings = new SettingsPages(page, tag);
        const form = await settings.openJournalTab('Masthead');
        await form.control('masthead-name-control').fill('New Probe Journal');
        await form.control('masthead-acronym-control').fill('NPJ');
        await form.save();

        // The article published before: the new name in its header and
        // browser title (Rule 7), the old one in its "How to Cite" (Rule 7a).
        await landing.goto(first.submissionId);
        await expect(header).toHaveText(whole('New Probe Journal'));
        await expect(visitor).toHaveTitle(/New Probe Journal$/);
        await expect(landing.citation()).toContainText('Old Probe Journal');
        await expect(landing.citation()).not.toContainText('New Probe Journal');

        // Its abbreviated citation: "AMA" prints the initials of its day,
        // "OPJ", not "NPJ" (Rule 7a).
        await landing.openFormats();
        const firstAma = await landing.chooseFormat('AMA');
        expect(firstAma).toContain('First Probe Article. OPJ.');
        expect(firstAma).not.toContain('NPJ');

        // An article published after the save: its "How to Cite" names "New
        // Probe Journal" and its "AMA" citation prints "NPJ" (Rule 7a).
        await publishIntoFutureIssue(page, tag, second.submissionId, /Vol\. 9 No\. 9 \(2099\)/);
        await landing.goto(second.submissionId);
        await expect(landing.citation()).toContainText('New Probe Journal');
        await expect(landing.citation()).not.toContainText('Old Probe Journal');
        await landing.openFormats();
        const secondAma = await landing.chooseFormat('AMA');
        expect(secondAma).toContain('Second Probe Article. NPJ.');
        expect(secondAma).not.toContain('OPJ');
    });
});
