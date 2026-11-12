// @ts-check
/**
 * @file playwright/tests/U07-journal-identity-and-about-pages.spec.js
 *
 * Journal identity & about pages — OPS suite, one test per canonical
 * scenario the spec runs on a preprint server, in the server's own words
 * ("About the Server", "Server Settings", "Server Title", "Moderator",
 * "This server …"): the common scenarios 1–5, 7, 8, 10, 13 and 14, and the
 * server's own scenario 12. Scenarios 6, 9 and 11 are badged {OJS OMP}: a
 * preprint server has no Information texts (scenario 12 reads their
 * absence), no reviews and no manager-level role but the Preprint Server
 * Manager. The bullets a common scenario badges {OJS} (scenario 3's ISSN
 * and address) have no surface here and are not run.
 * Spec: docs/specs/U07-journal-identity-and-about-pages.md
 *
 * Deliberately NOT covered (register IDs; the spec's Coverage section is
 * the record of everything else left out):
 * - A1 🐞, A7 🐞, OPS3 🐞
 * - A3 ❓, A6 ❓, A8 ❓ (each read only as its scenario states it), OPS2 ❓
 * - U06's OMP1 🐞 (S8's masthead choice: its error window is dismissed and
 *   the saved choice asserted)
 *
 * Seeding: scenario endpoints only. S1, S2 and S12 read the seeded server
 * `publicknowledge` with roster accounts and change nothing there; every
 * other test seeds its own scratch server with throwaway accounts
 * (footnote y), through the context keys `name`, `acronym`, `country` and
 * `plugins` (S13, S14) and the user keys `affiliation`, `orcid` /
 * `orcidIsVerified`, `masthead` and `pastRoles[]` (scenarios.md); S4 and
 * S14 seed their preprints through `POST scenarios/submission`. A scratch
 * server has no Country and no technical support contact (seed-facts): S3
 * picks a Country and S4 types the support contact as the scenarios' own
 * steps. Every screen change a scenario's step names (the tabs' saves, the
 * invitations, "Remove Role", the masthead choice, "Remove User", "Disable
 * User", "Merge user", the role boxes, the "Editorial Masthead" tab's box,
 * "Disable Submissions", the wizard submission, "Post") is driven on
 * screen. Signed-out reads run in a browser context with an empty storage
 * state (patterns.md, parallel lesson 8); each actor gets its own `asUser`
 * context. Mail is read by unique throwaway recipients (PRINCIPLES A8). No
 * test changes a site setting (S5's site page is only read), so the whole
 * suite runs in the parallel `ops` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    SettingsPages,
    RolesTab,
    whole,
} = require('../../../../shared/playwright/pages/ContextIdentityPages.js');
const {WebsiteSettings} = require('../../../../shared/playwright/pages/AppearancePages.js');
const {
    UsersListPage,
    DisableUserWindow,
    RemoveUserDialog,
    MergeUserWindow,
} = require('../../../../shared/playwright/pages/UsersManagementPages.js');
const {ArticleLandingPage} = require('../../../../shared/playwright/pages/ArticleLandingPages.js');
const {
    ServerAboutPages,
    ServerWebsiteSettings,
    rolesTableHeaders,
    fillNewRoleRowWithoutMasthead,
} = require('../pages/ContextIdentityPages.js');
const {
    UsersRolesPage,
    SendInvitationWizard,
    AcceptInvitationWizard,
} = require('../pages/UserInvitationPages.js');
const {wizardUrl, expectWizardOpen, completeAndSubmitDraft} = require('../pages/SubmissionWizardPages.js');
const {openWorkflow, postPreprint} = require('../pages/PublicationPages.js');

const SERVER = 'publicknowledge';
const SERVER_TITLE = 'Public Knowledge Preprint Server';
const T = 30_000;
const REQUIRED = 'This field is required.';
const ROLE = 'Moderator'; // the Section editor of a journal (users.md)
const DEFAULT_PRIVACY =
    'The names and email addresses entered in this server site will be used exclusively for the stated purposes of this server and will not be made available for any other purpose or to any other party.';
const NOT_ACCEPTING =
    /This server is not accepting submissions at this time\. Visit the workflow settings to allow submissions\./;
const MASTHEAD_BOX = 'Consider role in masthead list';
const HISTORY_EMPTY = 'Editorial History Page This section lists past contributors.';
const THIS_YEAR = new Date().getUTCFullYear();

/** The five Settings pages, their side-menu entry and heading on a preprint server (Rule 1). */
const SETTINGS = [
    {key: 'journal', entry: 'Server', heading: 'Server Settings'},
    {key: 'website', entry: 'Website', heading: 'Website Settings'},
    {key: 'workflow', entry: 'Workflow', heading: 'Workflow Settings'},
    {key: 'distribution', entry: 'Distribution', heading: 'Distribution Settings'},
    {key: 'usersRoles', entry: 'Users & Roles', heading: 'Users & Roles'},
];

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u7${scenario}opw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for a scratch server (users.md: `<username>@mail.test`). */
function account(tag, suffix, givenName, familyName, roles, extra = {}) {
    return {username: `${tag}${suffix}`, givenName, familyName, email: `${tag}${suffix}@mail.test`, roles, ...extra};
}

/** YYYY-MM-DD, today in UTC (the PHP servers' zone). */
function today() {
    return new Date().toISOString().slice(0, 10);
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
 * The invitation email's accept link, scoped by recipient and subject
 * marker.
 */
async function acceptLink(pkpMail, {to, contains}) {
    const summary = await pkpMail.find({to, contains});
    const full = await pkpMail.fullMessage(summary.ID);
    const url = pkpMail.extractLink(full.HTML, 'Accept Invitation');
    expect(url, 'the invitation email carries an accept link').toContain('/invitation/accept');
    return url;
}

test.describe('journal identity & about pages', () => {
    test('S1: a visitor reads the seeded server\'s About pages', {tag: '@smoke'}, async ({browser, baseURL, asUser}) => {
        test.slow();
        const visitor = await signedOutPage(browser, baseURL);
        const about = new ServerAboutPages(visitor, SERVER, {locale: 'en'});

        // The "About" menu (Rule 12).
        await about.gotoHome();
        await about.openAboutMenu();
        await expect(about.aboutItems).toHaveText([
            whole('About the Server'),
            whole('Submissions'),
            whole('Editorial Masthead'),
            whole('Privacy Statement'),
            whole('Contact'),
        ]);

        // "About the Server": breadcrumb, heading and nothing after it; the
        // browser title (Rules 7, 12, 13).
        const seen = {};
        await about.chooseFromAboutMenu('About the Server');
        expect(await about.breadcrumbTrail()).toEqual(['Home', 'About the Server']);
        await expect(about.heading).toHaveText(whole('About the Server'));
        expect(await about.bodyText()).toBe('About the Server');
        await expect(visitor).toHaveTitle(`About the Server | ${SERVER_TITLE}`);
        seen.about = {trail: await about.breadcrumbTrail(), body: await about.bodyText()};

        // "Editorial Masthead": the Moderators and then the Editorial Board
        // Member, no Reviewer heading, entries "{year} – {name}" by family
        // name with no picture and no email; the history line and the rule,
        // no peer reviewers after it (Rules 14a, 14c, 14d, 15).
        await about.gotoHome();
        await about.chooseFromAboutMenu('Editorial Masthead');
        await expect(about.heading).toHaveText(whole('Editorial Masthead'));
        await expect(about.listHeadings()).toHaveText([whole(ROLE), whole('Editorial Board Member')]);
        await expect(about.listHeading('Reviewer')).toHaveCount(0);
        await expect(about.listHeading('Peer Reviewers in Previous Year')).toHaveCount(0);
        // The three Moderators share the family name "Section Editor", so
        // their order among themselves is not a spec fact.
        expect((await about.listNames(ROLE)).sort()).toEqual([
            'Ana Section Editor',
            'Omar Section Editor',
            'Ravi Section Editor',
        ]);
        expect(await about.listNames('Editorial Board Member')).toEqual(['Rita Assistant']);
        for (const heading of [ROLE, 'Editorial Board Member']) {
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
        expect(await about.bodyText()).toBe(HISTORY_EMPTY);
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

        // "Privacy Statement": the server's default statement (Fields; Rule 18).
        await about.chooseFromAboutMenu('Privacy Statement');
        await expect(about.heading).toHaveText(whole('Privacy Statement'));
        expect(await about.bodyText()).toBe(`Privacy Statement ${DEFAULT_PRIVACY}`);
        seen.privacy = {trail: await about.breadcrumbTrail(), body: await about.bodyText()};

        // The page about the software, from the footer's logo (Rule 20).
        await about.footerLogoLink.click();
        await expect(about.heading).toHaveText(whole('About Open Preprint Systems'));
        await expect(about.softwareParagraph()).toHaveText(
            /^\s*This server uses Open Preprint Systems \d+(\.\d+)+, which is open source preprint server management software developed, supported, and freely distributed by the Public Knowledge Project under the GNU General Public License\. Visit PKP's website to learn more about the software\. Please contact the server directly with questions about the server and submission of preprints\.\s*$/
        );
        const learnMore = about.softwareParagraph().getByRole('link', {name: 'learn more about the software', exact: true});
        await expect(learnMore).toHaveAttribute('href', /^https?:\/\/pkp\.sfu\.ca\/?$/);
        seen.software = {trail: await about.breadcrumbTrail(), body: await about.bodyText()};
        await about.softwareParagraph().getByRole('link', {name: 'contact the server', exact: true}).click();
        await expect(about.heading).toHaveText(whole('Contact'));
        expect(visitor.url()).toMatch(new RegExp(`/index\\.php/${SERVER}/(en/)?about/contact$`));

        // Control: the Reader, signed in, gets the same heading, breadcrumb
        // and content on each page, and no "Edit" link (Actors rows 4, 5).
        const readerPage = await (await asUser('reader.rosa')).newPage();
        const readerAbout = new ServerAboutPages(readerPage, SERVER, {locale: 'en'});
        for (const which of ['about', 'masthead', 'history', 'contact', 'privacy', 'software']) {
            await readerAbout.goto(which);
            expect({trail: await readerAbout.breadcrumbTrail(), body: await readerAbout.bodyText()}, which).toEqual(seen[which]);
            await expect(readerAbout.editLink).toHaveCount(0);
        }
    });

    test('S2: who opens the Settings pages and sees "Edit"', async ({browser, baseURL, asUser}) => {
        test.slow();
        test.setTimeout(360_000);

        // The Preprint Server Manager's side menu: the "Settings" group's
        // five entries, each a page with its heading and a row of tabs
        // (Actors row 1; Rule 1). This is also the scenario's control.
        const managerPage = await (await asUser('manager.maya')).newPage();
        const settings = new SettingsPages(managerPage, SERVER, {locale: 'en'});
        await openLanding(managerPage, SERVER);
        expect(await settings.settingsGroupItems()).toEqual(SETTINGS.map((s) => s.entry));
        for (const s of SETTINGS) {
            await settings.openSettingsEntry(s.entry);
            await expect(settings.heading).toHaveText(whole(s.heading));
            expect((await settings.topTabNames()).length).toBeGreaterThan(1);
            expect(managerPage.url()).toContain(`/management/settings/${settings.url(s.key).split('/settings/')[1]}`);
        }

        // The "Edit" links: "About the Server" carries one, read as "Edit"
        // then "Edit About the Server"; it opens Settings › Server on
        // "Masthead" in the same window. "Editorial History"'s opens the same
        // tab, "Contact"'s the "Contact" tab; the masthead and the privacy
        // page carry none (Actors row 5; Rule 21).
        const about = new ServerAboutPages(managerPage, SERVER, {locale: 'en'});
        const edits = [
            {which: 'about', name: 'Edit About the Server', tab: 'Masthead', hash: '#masthead'},
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
            await expect(settings.heading).toHaveText(whole('Server Settings'));
            await expect(settings.tab(e.tab)).toHaveAttribute('aria-selected', 'true');
            expect(managerPage.url()).toContain(`/management/settings/context${e.hash}`);
        }
        for (const which of ['masthead', 'privacy']) {
            await about.goto(which);
            await expect(about.heading).toBeVisible();
            await expect(about.editLink).toHaveCount(0);
        }

        // Every other role (a preprint server has no Reviewer): no
        // "Settings" group, the access-denied page at the five addresses, no
        // "Edit" link on the three pages (Actors rows 1, 5).
        for (const username of ['sectioneditor.ana', 'assistant.rita', 'author.alex', 'reader.rosa']) {
            await test.step(username, async () => {
                const page = await (await asUser(username)).newPage();
                const theirs = new SettingsPages(page, SERVER, {locale: 'en'});
                await openLanding(page, SERVER);
                await expect(theirs.settingsGroupHeader).toHaveCount(0);
                for (const s of SETTINGS) {
                    await theirs.gotoExpectingDenied(s.key);
                    await expect(theirs.topTabs).toHaveCount(0);
                }
                const theirAbout = new ServerAboutPages(page, SERVER, {locale: 'en'});
                for (const which of ['about', 'history', 'contact']) {
                    await theirAbout.goto(which);
                    await expect(theirAbout.editLink).toHaveCount(0);
                }
                await page.context().close();
            });
        }

        // Signed out: the Login page at the same five addresses (Actors row 1).
        const visitor = await signedOutPage(browser, baseURL);
        const signedOut = new SettingsPages(visitor, SERVER, {locale: 'en'});
        for (const s of SETTINGS) {
            await signedOut.gotoExpectingLogin(s.key);
            expect(visitor.url()).toContain('/login');
        }
    });

    test('S3: save the "Masthead" tab', async ({browser, baseURL, asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        await opsApi.createContext({tag, users: [account(tag, 'mg', 'Mona', 'Manager', ['manager'])]});
        const visitor = await signedOutPage(browser, baseURL);
        const publicPages = new ServerAboutPages(visitor, tag);

        // Control, before the save: "About the Server" shows its heading
        // alone and the header the server's former title (Rules 7, 13).
        await publicPages.goto('about');
        expect(await publicPages.bodyText()).toBe('About the Server');
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
        await expect(form.goToButton('Go to Server Initials: This field is required.')).toHaveCount(1);
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

        // The texts ("About the Server", "Editorial History").
        await form.typeRich('masthead-about-control', 'Our journal publishes probe articles.');
        await form.typeRich('masthead-editorialHistory-control', 'Founded in 2001.');

        // Saved (a preprint server has no ISSN or URL boxes: that bullet is
        // {OJS}).
        await form.save();

        // The public pages, signed out (Rules 7, 13, 16).
        await publicPages.goto('about');
        expect(await publicPages.bodyText()).toBe('About the Server Our journal publishes probe articles.');
        await expect(publicPages.headerTitle).toHaveText(whole('Probe Journal of Identity'));
        await expect(visitor).toHaveTitle('About the Server | Probe Journal of Identity');
        await publicPages.goto('history');
        expect(await publicPages.bodyText()).toBe(`${HISTORY_EMPTY} Founded in 2001.`);
        const site = new ServerAboutPages(visitor, 'index');
        await visitor.goto('/index.php/index');
        await expect(site.siteListEntry(tag)).toHaveText(whole('Probe Journal of Identity'), {timeout: T});
    });

    test('S4: save the "Contact" tab; the server\'s emails follow the new contact', async ({browser, baseURL, asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(360_000);
        const tag = makeTag('s4', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        const managerEmail = `${manager}@mail.test`;
        const authorEmail = `${author}@mail.test`;
        const serverTitle = `Scratch context ${tag}`;
        await opsApi.createContext({
            tag,
            users: [
                account(tag, 'mg', 'Mona', 'Manager', ['manager']),
                account(tag, 'au', 'Ada', 'Author', ['author']),
            ],
        });
        // The Author's submission in Production (on a preprint server the
        // one stage after submission; footnote y).
        const inProduction = await opsApi.createSubmission({
            tag: `${tag}p`,
            context: tag,
            submitter: author,
            title: `Production preprint ${tag}`,
        });
        const page = await (await asUser(manager)).newPage();
        const visitor = await signedOutPage(browser, baseURL);
        const publicPages = new ServerAboutPages(visitor, tag);
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

        // Control, before "Saved" (after the refused phone-only save): the
        // "Contact" page, signed out, shows the "Principal Contact" block
        // alone, with the contact the server was created with and no phone
        // (Rule 17).
        await publicPages.goto('contact');
        await expect(primary.heading).toHaveText(whole('Principal Contact'));
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

        // A new submission's emails: the Author completes and submits a new
        // submission in the wizard, a draft seeded as U21 scenario 2 seeds
        // it (the seed sends no mail); the Author's "Thank you for your
        // submission to {server title}" and the manager's "A new submission
        // needs an editor to be assigned" both come from "Pat Principal" at
        // the new address (Rule 9; Side effects).
        const draft = await opsApi.createSubmission({
            tag: `${tag}w`,
            context: tag,
            submitter: author,
            submitted: false,
            title: `Wizard preprint ${tag}`,
        });
        const authorPage = await (await asUser(author)).newPage();
        await authorPage.goto(wizardUrl(tag, draft.submissionId));
        await expectWizardOpen(authorPage);
        await completeAndSubmitDraft(authorPage);
        const thanks = await pkpMail.find({to: authorEmail, subject: 'Thank you for your submission', timeoutMs: 30_000});
        expect(flat(thanks.Subject)).toBe(`Thank you for your submission to ${serverTitle}`);
        expect(thanks.From.Name).toBe('Pat Principal');
        expect(thanks.From.Address).toBe('pat.principal@mail.test');
        const needsEditor = await pkpMail.find({
            to: managerEmail,
            subject: 'A new submission needs an editor to be assigned',
            timeoutMs: 30_000,
        });
        expect(needsEditor.From.Name).toBe('Pat Principal');
        expect(needsEditor.From.Address).toBe('pat.principal@mail.test');

        // The server's next email: the manager posts the submission in
        // Production (U49 scenario 1); the Author's "Publication Published"
        // comes in the server's title from the new address (Rule 9; Side
        // effects).
        await openWorkflow(page, tag, inProduction.submissionId);
        await postPreprint(page);
        const published = await pkpMail.find({
            to: authorEmail,
            subject: 'Publication Published',
            contains: `Production preprint ${tag}`,
            timeoutMs: 30_000,
        });
        expect(published.From.Name).toBe(serverTitle);
        expect(published.From.Address).toBe('pat.principal@mail.test');

        // The password reset, signed out, from the Login page's "Forgot your
        // password?": sent by the site ("Open Preprint Systems" at the
        // site's contact address), not by "Pat Principal" (Side effects).
        await visitor.goto(`/index.php/${tag}/login`);
        await visitor.getByRole('link', {name: 'Forgot your password?'}).click();
        await visitor.locator('form#lostPasswordForm input#email').fill(authorEmail);
        await visitor.locator('form#lostPasswordForm').getByRole('button', {name: 'Reset Password'}).click();
        const reset = await pkpMail.find({to: authorEmail, subject: 'Password Reset Confirmation'});
        expect(reset.From.Name).toBe('Open Preprint Systems');
        expect(reset.From.Address).toBe('admin@mail.test');
        expect(reset.From.Name).not.toBe('Pat Principal');
        expect(reset.From.Address).not.toBe('pat.principal@mail.test');
    });

    test('S5: change and empty the "Privacy Statement"', async ({browser, baseURL, asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        await opsApi.createContext({tag, users: [account(tag, 'mg', 'Mona', 'Manager', ['manager'])]});
        const page = await (await asUser(`${tag}mg`)).newPage();
        const settings = new SettingsPages(page, tag);
        const visitor = await signedOutPage(browser, baseURL);
        const publicPages = new ServerAboutPages(visitor, tag);

        // The tab: the server's default statement; replaced and saved (Fields).
        let form = await settings.openWebsiteSetupTab('privacy');
        expect(words(await form.richContent('privacy-privacyStatement-control'))).toBe(DEFAULT_PRIVACY);
        await form.typeRich('privacy-privacyStatement-control', 'We keep your data in Probe City.');
        await form.save();

        // The page, signed out, from the "About" menu (Rule 18); the
        // manager's view carries no "Edit" link (Rule 21), where "About the
        // Server" carries one (the control).
        await publicPages.gotoHome();
        await publicPages.chooseFromAboutMenu('Privacy Statement');
        expect(await publicPages.breadcrumbTrail()).toEqual(['Home', 'Privacy Statement']);
        await expect(publicPages.heading).toHaveText(whole('Privacy Statement'));
        expect(await publicPages.bodyText()).toBe('Privacy Statement We keep your data in Probe City.');
        const managerAbout = new ServerAboutPages(page, tag);
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

    test('S7: who "Editorial Masthead" and "Editorial History" list', async ({browser, baseURL, opsApi}, testInfo) => {
        const tag = makeTag('s7', testInfo);
        const mikeOrcid = 'https://orcid.org/0000-0002-1825-0097';
        await opsApi.createContext({
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
        const about = new ServerAboutPages(visitor, tag);

        // The role headings: "Moderator" and then "Editorial Board Member"
        // (Rules 14a, 14b); a preprint server has no Journal editor role.
        await about.goto('masthead');
        await expect(about.listHeadings()).toHaveText([whole(ROLE), whole('Editorial Board Member')]);
        await expect(about.listHeading('Journal editor')).toHaveCount(0);

        // The Moderators by family name, this year and a dash, Mike's
        // affiliation and ORCID icon; no picture, no email (Rules 14b, 14c).
        expect(await about.listNames(ROLE)).toEqual(['Al Alpha', 'Max Mike', 'Zed Zulu']);
        const entries = about.listEntries(ROLE);
        for (let i = 0; i < 3; i++) {
            const parts = about.entryParts(entries.nth(i));
            await expect(parts.dateStart).toHaveText(new RegExp(`^\\s*${THIS_YEAR} –\\s*$`));
            await expect(parts.pictures).toHaveCount(0);
            await expect(parts.emailLinks).toHaveCount(0);
            expect(await entries.nth(i).innerText()).not.toContain('@');
        }
        const mike = about.entryParts(about.listEntry(ROLE, 'Max Mike'));
        await expect(mike.affiliation).toHaveText(whole('Masthead University'));
        await expect(mike.orcidLink).toHaveAttribute('href', mikeOrcid);
        await expect(mike.orcidLink).toHaveAttribute('target', '_blank');
        await expect(about.entryParts(about.listEntry(ROLE, 'Zed Zulu')).orcidLink).toHaveCount(0);

        // The member who does not appear is not under "Moderator" (Rule
        // 14b); the control: listed under "Editorial Board Member".
        expect(await about.listNames(ROLE)).not.toContain('Fay Fourth');
        expect(await about.listNames('Editorial Board Member')).toEqual(['Fay Fourth']);

        // The history: the past Moderators with their periods, the latest
        // first, and the affiliation; nobody still serving (Rule 16).
        await about.historyLink().click();
        await expect(about.heading).toHaveText(whole('Editorial History Page'));
        await expect(about.listHeadings()).toHaveText([whole(ROLE)]);
        expect(await about.listNames(ROLE)).toEqual(['Pat Past', 'Quin Twice']);
        const past = about.entryParts(about.listEntry(ROLE, 'Pat Past'));
        await expect(past.dateStart).toHaveText(whole('2019 – 2024'));
        await expect(past.affiliation).toHaveText(whole('Past University'));
        const twice = about.entryParts(about.listEntry(ROLE, 'Quin Twice'));
        await expect(twice.dateStart).toHaveText(whole('2020 – 2022, 2015 – 2016'));
        await expect(twice.affiliation).toHaveCount(0);
    });

    test('S8: changes to the team show at the next load', async ({browser, baseURL, asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(420_000);
        const tag = makeTag('s8', testInfo);
        const email = (suffix) => `${tag}${suffix}@mail.test`;
        const EBM = 'Editorial Board Member';
        await opsApi.createContext({
            tag,
            users: [
                account(tag, 'mg', 'Mona', 'Manager', ['manager']),
                account(tag, 'ab', 'Ann', 'Able', ['sectionEditor', 'reader']),
                account(tag, 'ba', 'Ben', 'Baker', ['sectionEditor']),
                account(tag, 'ca', 'Cal', 'Carter', ['sectionEditor']),
                account(tag, 'fo', 'Fay', 'Ford', ['editorialBoardMember']),
                account(tag, 'gr', 'Gus', 'Grant', ['editorialBoardMember']),
                account(tag, 'hi', 'Hal', 'Hill', ['editorialBoardMember']),
                account(tag, 'du', 'Dee', 'Dunn', ['reader']),
                account(tag, 'ir', 'Ivy', 'Irwin', ['reader']),
                account(tag, 'ev', 'Eve', 'Evans', ['author'], {masthead: {author: true}}),
            ],
        });
        const visitor = await signedOutPage(browser, baseURL);
        const about = new ServerAboutPages(visitor, tag);
        const page = await (await asUser(`${tag}mg`)).newPage();
        const usersRoles = new UsersRolesPage(page, tag);
        const wizard = new SendInvitationWizard(page);
        const list = new UsersListPage(page, tag);

        /** Invite an existing reader to the Moderator role, set to appear, and accept from the mailbox. */
        const inviteAndAccept = async (suffix, dateStart) => {
            const subject = `Invitation${tag}${suffix}`;
            await usersRoles.goto();
            await usersRoles.inviteToRoleButton.click();
            await wizard.expectSearchStep();
            await wizard.searchAndContinue(email(suffix));
            await expect(wizard.userFoundMessage).toBeVisible();
            await wizard.fillNewRoleRow(0, {role: ROLE, dateStart, masthead: 'Appear on the masthead'});
            await wizard.saveAndContinueButton.click();
            await wizard.setSubject(subject);
            await wizard.sendAndAwaitConfirmation();
            const link = await acceptLink(pkpMail, {to: email(suffix), contains: subject});
            const inviteePage = await signedOutPage(browser, baseURL);
            const accept = new AcceptInvitationWizard(inviteePage);
            await accept.open(link);
            await expect(accept.reviewHeading).toBeVisible({timeout: T});
            await accept.acceptAndAwaitConfirmation();
            await inviteePage.context().close();
        };

        // Before: the three Moderators and the three Editorial Board
        // Members, no "Author" heading; nobody on the history page (Rules
        // 14a, 16).
        await about.goto('masthead');
        await expect(about.listHeadings()).toHaveText([whole(ROLE), whole(EBM)]);
        expect(await about.listNames(ROLE)).toEqual(['Ann Able', 'Ben Baker', 'Cal Carter']);
        expect(await about.listNames(EBM)).toEqual(['Fay Ford', 'Gus Grant', 'Hal Hill']);
        await expect(about.listHeading('Author')).toHaveCount(0);
        await about.goto('history');
        expect(await about.bodyText()).toBe(HISTORY_EMPTY);

        // A role given: Dunn invited to the Moderator role from today, set
        // to appear, and accepting from the mailbox (Rules 14b, 14e).
        await inviteAndAccept('du', today());
        await about.goto('masthead');
        expect(await about.listNames(ROLE)).toEqual(['Ann Able', 'Ben Baker', 'Cal Carter', 'Dee Dunn']);
        await expect(about.entryParts(about.listEntry(ROLE, 'Dee Dunn')).dateStart).toHaveText(
            new RegExp(`^\\s*${THIS_YEAR} –\\s*$`)
        );

        // "Remove Role" on Able's Moderator role: off the masthead, onto the
        // history with this year on both sides (Rules 14e, 16).
        await usersRoles.goto();
        await usersRoles.openUserEdit(email('ab'));
        await expect(wizard.stepHeading(/Enter details/)).toBeVisible({timeout: T});
        await wizard.removeRoleButton(wizard.currentRoleRow(ROLE)).click();
        await expect(wizard.removeRoleDialog).toBeVisible();
        const ended = page.waitForResponse((r) => r.url().includes('/endRole/'));
        await wizard.removeRoleDialog.getByRole('button', {name: 'Remove Role'}).click();
        expect((await ended).status()).toBe(200);
        await expect(wizard.removeRoleDialog).toBeHidden();
        await about.goto('masthead');
        expect(await about.listNames(ROLE)).toEqual(['Ben Baker', 'Cal Carter', 'Dee Dunn']);
        await about.goto('history');
        await expect(about.listHeadings()).toHaveText([whole(ROLE)]);
        expect(await about.listNames(ROLE)).toEqual(['Ann Able']);
        await expect(about.entryParts(about.listEntry(ROLE, 'Ann Able')).dateStart).toHaveText(
            whole(`${THIS_YEAR} – ${THIS_YEAR}`)
        );

        // The masthead choice: Baker set to "Does not appear on the
        // masthead" and confirmed; on a preprint server the confirmation
        // answers with an error window (U06's OMP1), dismissed, and the
        // choice is saved: the select reads it after a reload. Off the
        // masthead and not on the history (Rule 14e; Settings bullet 3).
        await usersRoles.goto();
        await usersRoles.openUserEdit(email('ba'));
        await expect(wizard.stepHeading(/Enter details/)).toBeVisible({timeout: T});
        await wizard.chooseMasthead(wizard.currentRoleRow(ROLE), 'Does not appear on the masthead');
        await wizard.confirmMastheadChange();
        await page.reload();
        await expect(wizard.stepHeading(/Enter details/)).toBeVisible({timeout: T});
        await expect(wizard.mastheadSelect(wizard.currentRoleRow(ROLE))).toHaveValue('false');
        await about.goto('masthead');
        expect(await about.listNames(ROLE)).toEqual(['Cal Carter', 'Dee Dunn']);
        await about.goto('history');
        expect(await about.listNames(ROLE)).toEqual(['Ann Able']);

        // A later start date: Irwin invited as Dunn was, starting 30 days
        // from today, and accepting: not listed (Rule 14e). The control is
        // Dunn, accepted the same way from today and listed.
        const later = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        await inviteAndAccept('ir', later);
        await about.goto('masthead');
        expect(await about.listNames(ROLE)).toEqual(['Cal Carter', 'Dee Dunn']);
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
        await expect(about.listHeadings()).toHaveText([whole(ROLE), whole(EBM)]);
        expect(await about.listNames(EBM)).toEqual(['Fay Ford']);

        // "Disable User" on Grant, then on Ford, whose row stays on the
        // list: Grant still on the masthead, Ford still on the history
        // (Rule 14e).
        for (const [suffix, name] of [['gr', 'Gus Grant'], ['fo', 'Fay Ford']]) {
            await list.goto();
            const row = list.row(email(suffix));
            await list.chooseAction(row, 'Disable User');
            const disable = new DisableUserWindow(page, `Disable ${name}`);
            await disable.expectForm();
            await disable.ok();
            await expect(list.disabledIcon(row)).toHaveCount(1);
        }
        await about.goto('masthead');
        expect(await about.listNames(EBM)).toEqual(['Gus Grant', 'Hal Hill']);
        await about.goto('history');
        expect(await about.listNames(EBM)).toEqual(['Fay Ford']);
        expect(await about.listNames(ROLE)).toEqual(['Ann Able']);

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

        // Unticked on the Moderator role: the heading and Carter and Dunn
        // gone; the history no longer lists Able (Rule 14e; Settings bullet
        // 2). Control: the "Author" heading with Evans stays, and Ford stays
        // on the history.
        await roles.setRoleBox(ROLE, MASTHEAD_BOX, false);
        await about.goto('masthead');
        await expect(about.listHeading('Author')).toHaveCount(1);
        expect(await about.listNames('Author')).toEqual(['Eve Evans']);
        await expect(about.listHeading(ROLE)).toHaveCount(0);
        const mastheadText = await about.bodyText();
        expect(mastheadText).not.toContain('Cal Carter');
        expect(mastheadText).not.toContain('Dee Dunn');
        await about.goto('history');
        await expect(about.listHeadings()).toHaveText([whole(EBM)]);
        expect(await about.listNames(EBM)).toEqual(['Fay Ford']);
        expect(await about.bodyText()).not.toContain('Ann Able');
    });

    test('S10: a server not accepting submissions', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        await opsApi.createContext({tag, users: [account(tag, 'mg', 'Mona', 'Manager', ['manager'])]});
        const page = await (await asUser(`${tag}mg`)).newPage();
        const settings = new SettingsPages(page, tag);

        // Control, before the box is ticked: no notice on Settings › Server.
        await settings.goto('journal');
        await expect(settings.heading).toHaveText(whole('Server Settings'));
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

        // Allowed again: gone from Settings › Server on its next load (Rule
        // 4a; A8 is the open page, not read here).
        form = await settings.openDisableSubmissions();
        await form.form.getByRole('checkbox', {name: 'Disable Submissions'}).uncheck();
        await form.save();
        await settings.goto('journal');
        await expect(settings.heading).toHaveText(whole('Server Settings'));
        await expect(settings.mainRegion.getByText(NOT_ACCEPTING)).toHaveCount(0);
    });

    test('S12: no Information texts and no peer reviewers on a preprint server', async ({browser, baseURL, asUser}) => {
        test.slow();
        const page = await (await asUser('manager.maya')).newPage();
        const settings = new ServerWebsiteSettings(page, SERVER, {locale: 'en'});

        // The "Setup" side tabs: "Privacy Statement" and no "Information"
        // (Rule 19c; OPS1).
        await settings.openSetup();
        const sideTabs = settings.setupSideTabs();
        await expect(sideTabs.filter({hasText: whole('Privacy Statement')})).toHaveCount(1);
        await expect(sideTabs.filter({hasText: whole('Information')})).toHaveCount(0);

        // Control: the "Privacy Statement" side tab opens with its box.
        await sideTabs.filter({hasText: whole('Privacy Statement')}).click();
        const privacy = settings.privacyForm();
        await privacy.ready();
        await expect(privacy.control('privacy-privacyStatement-control')).toBeAttached();
        await expect(privacy.richBody('privacy-privacyStatement-control')).toBeVisible();

        // The "Sidebar" list: blocks offered, none of them the Information
        // block (Rule 19c).
        await settings.openAppearanceSetup();
        await expect(settings.sidebarChoices().first()).toBeAttached();
        const choices = await settings.sidebarChoiceList();
        expect(choices.length).toBeGreaterThan(0);
        expect(choices.filter((c) => /information/i.test(`${c.value} ${c.label}`))).toEqual([]);

        // The Information addresses, signed out: "404 Not Found" (Rule 19c).
        const visitor = await signedOutPage(browser, baseURL);
        const about = new ServerAboutPages(visitor, SERVER, {locale: 'en'});
        for (const which of ['readers', 'authors', 'librarians']) {
            const response = await visitor.goto(about.url(which));
            expect(response && response.status(), which).toBe(404);
            await expect(visitor.locator('h1')).toHaveText(whole('404 Not Found'));
        }

        // Control: the "Contact" page opens at the address the header's
        // "About" menu gives it, with its heading (Rule 17).
        await about.gotoHome();
        await about.chooseFromAboutMenu('Contact');
        await expect(about.heading).toHaveText(whole('Contact'));
        expect(visitor.url()).toMatch(new RegExp(`/index\\.php/${SERVER}/(en/)?about/contact$`));

        // The masthead ends with the history line and the rule, no "Peer
        // Reviewers in Previous Year" after them (Rule 15); control: the
        // role headings show above the rule (Rule 14a).
        await about.goto('masthead');
        await expect(about.listHeadings()).toHaveText([whole(ROLE), whole('Editorial Board Member')]);
        await expect(about.historyLine()).toHaveText(/^\s*View\s+Editorial History\s*$/);
        await expect(about.rule()).toHaveCount(1);
        await expect(about.main.locator('.page_masthead > hr ~ *')).toHaveCount(0);
        await expect(about.listHeading('Peer Reviewers in Previous Year')).toHaveCount(0);
        expect(await about.bodyText()).not.toContain('Peer Reviewers');
        const headingsAboveRule = await about.main.locator('.page_masthead > hr').evaluate((hr) =>
            [...hr.parentElement.querySelectorAll(':scope > h2')].filter(
                (h) => !!(h.compareDocumentPosition(hr) & Node.DOCUMENT_POSITION_FOLLOWING)
            ).length
        );
        expect(headingsAboveRule).toBe(2);
    });

    test('S13: a masthead not based on enrollments', async ({browser, baseURL, asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(360_000);
        const tag = makeTag('s13', testInfo);
        const email = (suffix) => `${tag}${suffix}@mail.test`;
        await opsApi.createContext({
            tag,
            context: {acronym: 'PMH', country: 'CA'},
            users: [
                account(tag, 'mg', 'Mona', 'Manager', ['manager']),
                account(tag, 'ab', 'Ann', 'Able', ['sectionEditor']),
                account(tag, 'co', 'Cy', 'Cole', ['reader']),
                account(tag, 'da', 'Dan', 'Dale', ['reader'], {
                    pastRoles: [{role: 'sectionEditor', dateStart: '2019-01-01', dateEnd: '2024-12-31'}],
                }),
            ],
        });
        const visitor = await signedOutPage(browser, baseURL);
        const about = new ServerAboutPages(visitor, tag);
        const page = await (await asUser(`${tag}mg`)).newPage();
        const managerAbout = new ServerAboutPages(page, tag);
        const website = new WebsiteSettings(page, tag);
        const roles = new RolesTab(page, tag);
        const usersRoles = new UsersRolesPage(page, tag);
        const wizard = new SendInvitationWizard(page);
        const historyAddress = about.url('history');

        // Before: Able under "Moderator", then the history line; its link
        // opens "Editorial History", which lists Dale "2019 – 2024" (Rules
        // 14, 16).
        await about.goto('masthead');
        await expect(about.listHeadings()).toHaveText([whole(ROLE)]);
        expect(await about.listNames(ROLE)).toEqual(['Ann Able']);
        await expect(about.historyLine()).toHaveText(/^\s*View\s+Editorial History\s*$/);
        await about.historyLink().click();
        await expect(about.heading).toHaveText(whole('Editorial History Page'));
        expect(new URL(visitor.url()).pathname).toBe(historyAddress);
        expect(await about.listNames(ROLE)).toEqual(['Dan Dale']);
        await expect(about.entryParts(about.listEntry(ROLE, 'Dan Dale')).dateStart).toHaveText(whole('2019 – 2024'));

        // The box unticked: the "Editorial Masthead" list leaves the tab at
        // once, before any save (a preprint server's tab has no "Reviewers"
        // group either way); "Save" (Settings bullet 4a).
        await website.goto();
        const tab = await website.open('appearance-masthead');
        await expect(tab.enrollmentBox).toBeChecked();
        expect(await tab.roles.labels()).toEqual([ROLE, 'Editorial Board Member']);
        await expect(tab.reviewersField).toHaveCount(0);
        await tab.enrollmentBox.uncheck();
        await expect(tab.enrollmentBox).not.toBeChecked();
        await expect(tab.roles.fieldset).toHaveCount(0);
        await expect(tab.reviewersField).toHaveCount(0);
        await expect(tab.enrollmentField).toBeVisible();
        await tab.save();

        // The masthead, its text empty: under the heading the "Edit" link
        // alone; no role heading, no Able, no history line, no rule (Rules
        // 14f, 21).
        await managerAbout.goto('masthead');
        await expect(managerAbout.heading).toHaveText(whole('Editorial Masthead'));
        await expect(managerAbout.editLink).toHaveCount(1);
        await expect(managerAbout.editLink).toHaveAccessibleName(/^\W*Edit\s+Edit Editorial Masthead$/);
        await expect(managerAbout.listHeadings()).toHaveCount(0);
        await expect(managerAbout.historyLine()).toHaveCount(0);
        await expect(managerAbout.rule()).toHaveCount(0);
        expect(await managerAbout.bodyText()).toBe('Editorial Masthead Edit Edit Editorial Masthead');

        // Its "Edit" link: Settings › Server on its "Masthead" tab, in the
        // same window (Rule 21); "Founded in 2001." typed in "Editorial
        // History" and saved (Fields).
        await expect(managerAbout.editLink).not.toHaveAttribute('target', /.+/);
        await managerAbout.editLink.click();
        const settings = new SettingsPages(page, tag);
        await expect(settings.heading).toHaveText(whole('Server Settings'));
        await expect(settings.tab('Masthead')).toHaveAttribute('aria-selected', 'true');
        expect(page.url()).toContain('/management/settings/context#masthead');
        const masthead = settings.mastheadForm();
        await masthead.ready();
        await masthead.typeRich('masthead-editorialHistory-control', 'Founded in 2001.');
        await masthead.save();

        // The masthead with its text, signed out: "Founded in 2001." and
        // nothing else, no "Edit" link (Rule 14f).
        await about.goto('masthead');
        await expect(about.heading).toHaveText(whole('Editorial Masthead'));
        expect(await about.bodyText()).toBe('Editorial Masthead Founded in 2001.');
        await expect(about.editLink).toHaveCount(0);
        await expect(about.listHeadings()).toHaveCount(0);
        await expect(about.rule()).toHaveCount(0);

        // The "Editorial History" address opens "Editorial Masthead", signed
        // out and as the manager (Rule 14f).
        await visitor.goto(historyAddress);
        await expect(about.heading).toHaveText(whole('Editorial Masthead'));
        expect(new URL(visitor.url()).pathname).toBe(about.url('masthead'));
        await page.goto(historyAddress);
        await expect(managerAbout.heading).toHaveText(whole('Editorial Masthead'));
        expect(new URL(page.url()).pathname).toBe(managerAbout.url('masthead'));

        // The role window: no "Consider role in masthead list" box; its
        // other boxes are there (Settings bullet 2).
        await roles.goto();
        await roles.openRoleWindow(ROLE);
        await expect(roles.roleWindow.getByRole('checkbox').first()).toBeVisible();
        await expect(roles.box(MASTHEAD_BOX)).toHaveCount(0);
        await expect(roles.roleWindow).not.toContainText(MASTHEAD_BOX);

        // The user's "Edit" page: Able's roles table has no masthead column
        // and shows neither masthead choice; the Moderator row is there
        // (Settings bullet 3).
        await usersRoles.goto();
        await usersRoles.openUserEdit(email('ab'));
        await expect(wizard.stepHeading(/Enter details/)).toBeVisible({timeout: T});
        await expect(wizard.currentRoleRow(ROLE)).toBeVisible();
        expect(await rolesTableHeaders(page)).toEqual(['Role', 'Start Date', 'End Date']);
        await expect(wizard.mastheadSelect(wizard.currentRoleRow(ROLE))).toHaveCount(0);
        await expect(page.locator('main')).not.toContainText(/appear on the masthead/i);

        // "Invite to a role": Cole to the Moderator role from today; the
        // role row has no masthead column, so no masthead choice; sent
        // (Settings bullet 3).
        const subject = `Invitation${tag}`;
        await usersRoles.goto();
        await usersRoles.inviteToRoleButton.click();
        await wizard.expectSearchStep();
        await wizard.searchAndContinue(email('co'));
        await expect(wizard.userFoundMessage).toBeVisible();
        expect(await rolesTableHeaders(page)).toEqual(['Role', 'Start Date', 'End Date']);
        await expect(page.locator('main')).not.toContainText(/appear on the masthead/i);
        await fillNewRoleRowWithoutMasthead(wizard, 0, {role: ROLE, dateStart: today()});
        await wizard.saveAndContinueButton.click();
        await wizard.setSubject(subject);
        await wizard.sendAndAwaitConfirmation();

        // Cole's side: the email names the role and says nothing about the
        // masthead; the review step has no masthead column; accepted
        // (Settings bullet 3).
        const invitation = await pkpMail.find({to: email('co'), contains: subject});
        const full = await pkpMail.fullMessage(invitation.ID);
        expect(full.Text).toContain(ROLE);
        expect(full.Text).not.toMatch(/masthead/i);
        const link = pkpMail.extractLink(full.HTML, 'Accept Invitation');
        expect(link, 'the invitation email carries an accept link').toContain('/invitation/accept');
        const colePage = await signedOutPage(browser, baseURL);
        const accept = new AcceptInvitationWizard(colePage);
        await accept.open(link);
        await expect(accept.reviewHeading).toBeVisible({timeout: T});
        await expect(colePage.getByRole('row').filter({hasText: ROLE})).toBeVisible();
        expect(await rolesTableHeaders(colePage)).toEqual(['Role', 'Start Date', 'End Date']);
        await expect(colePage.locator('main')).not.toContainText(/masthead/i);
        await accept.acceptAndAwaitConfirmation();

        // Ticked again: Able under "Moderator" and the history line as
        // before, Cole not listed; "Editorial History" opens again, Dale
        // "2019 – 2024" and "Founded in 2001." below the list (Rules 14f,
        // 16; Settings bullet 3).
        await website.goto();
        const again = await website.open('appearance-masthead');
        await expect(again.enrollmentBox).not.toBeChecked();
        await again.enrollmentBox.check();
        await expect(again.roles.fieldset).toBeVisible();
        await again.save();
        await about.goto('masthead');
        await expect(about.listHeadings()).toHaveText([whole(ROLE)]);
        expect(await about.listNames(ROLE)).toEqual(['Ann Able']);
        await expect(about.historyLine()).toHaveText(/^\s*View\s+Editorial History\s*$/);
        await expect(about.rule()).toHaveCount(1);
        expect(await about.bodyText()).not.toContain('Cy Cole');
        await about.historyLink().click();
        await expect(about.heading).toHaveText(whole('Editorial History Page'));
        expect(new URL(visitor.url()).pathname).toBe(historyAddress);
        expect(await about.listNames(ROLE)).toEqual(['Dan Dale']);
        await expect(about.entryParts(about.listEntry(ROLE, 'Dan Dale')).dateStart).toHaveText(whole('2019 – 2024'));
        // The entry's year and name are separate spans with no space between.
        expect(await about.bodyText()).toMatch(
            /^Editorial History Page This section lists past contributors\. Moderator 2019 – 2024 ?Dan Dale Founded in 2001\.$/
        );

        // Cole's masthead choice: "Does not appear on the masthead", the
        // choice the invitation sent while the masthead was off (Settings
        // bullet 3).
        await usersRoles.goto();
        await usersRoles.openUserEdit(email('co'));
        await expect(wizard.stepHeading(/Enter details/)).toBeVisible({timeout: T});
        await expect(wizard.mastheadChoice(wizard.currentRoleRow(ROLE))).toHaveText(whole('Does not appear on the masthead'));

        // Control: the Moderator role's window holds "Consider role in
        // masthead list" again (Settings bullet 2).
        await roles.goto();
        await roles.openRoleWindow(ROLE);
        await expect(roles.box(MASTHEAD_BOX)).toHaveCount(1);
    });

    test('S14: a published preprint keeps the server\'s name of its day', async ({browser, baseURL, asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s14', testInfo);
        const author = `${tag}au`;
        await opsApi.createContext({
            tag,
            context: {name: 'Old Probe Journal', acronym: 'OPJ', country: 'CA'},
            plugins: {citationstylelanguageplugin: {enabled: true}},
            users: [account(tag, 'mg', 'Mona', 'Manager', ['manager']), account(tag, 'au', 'Ada', 'Author', ['author'])],
        });
        const first = await opsApi.createSubmission({
            tag: `${tag}a`,
            context: tag,
            submitter: author,
            title: 'First Probe Preprint',
            published: true,
        });
        const second = await opsApi.createSubmission({
            tag: `${tag}b`,
            context: tag,
            submitter: author,
            title: 'Second Probe Preprint',
        });
        const visitor = await signedOutPage(browser, baseURL);
        const landing = new ArticleLandingPage(visitor, tag, {op: 'preprint'});
        const chrome = new ServerAboutPages(visitor, tag);

        // Control, before the save: the first preprint's page shows "Old
        // Probe Journal" in its header (Rule 7).
        await landing.goto(first.submissionId);
        await expect(chrome.headerTitle).toHaveText(whole('Old Probe Journal'));

        // The rename: "Server Title" and "Server Initials" replaced and
        // saved (Fields).
        const page = await (await asUser(`${tag}mg`)).newPage();
        const settings = new SettingsPages(page, tag);
        const form = await settings.openJournalTab('Masthead');
        await form.control('masthead-name-control').fill('New Probe Journal');
        await form.control('masthead-acronym-control').fill('NPJ');
        await form.save();

        // The preprint posted before: the new name in its header and at the
        // end of its browser title (Rule 7), the old one in its "How to
        // Cite" (Rule 7a).
        await landing.goto(first.submissionId);
        await expect(chrome.headerTitle).toHaveText(whole('New Probe Journal'));
        await expect(visitor).toHaveTitle(/ \| New Probe Journal$/);
        await expect(landing.citation()).toContainText('Old Probe Journal');
        await expect(landing.citation()).not.toContainText('New Probe Journal');

        // Its abbreviated citation: AMA prints "OPJ", the initials of its
        // posting day, not "NPJ" (Rule 7a).
        await landing.openFormats();
        const firstAma = await landing.chooseFormat('AMA');
        expect(firstAma).toContain('First Probe Preprint');
        expect(firstAma).toMatch(/\bOPJ\b/);
        expect(firstAma).not.toMatch(/\bNPJ\b/);

        // A preprint posted after the save: the manager posts the second
        // (U49 scenario 1); its "How to Cite" names "New Probe Journal" and
        // its AMA citation prints "NPJ" (Rule 7a).
        await openWorkflow(page, tag, second.submissionId);
        await postPreprint(page);
        await landing.goto(second.submissionId);
        await expect(landing.citation()).toContainText('New Probe Journal');
        await expect(landing.citation()).not.toContainText('Old Probe Journal');
        await landing.openFormats();
        const secondAma = await landing.chooseFormat('AMA');
        expect(secondAma).toContain('Second Probe Preprint');
        expect(secondAma).toMatch(/\bNPJ\b/);
        expect(secondAma).not.toMatch(/\bOPJ\b/);
    });
});
