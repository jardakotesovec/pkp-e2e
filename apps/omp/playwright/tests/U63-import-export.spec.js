// @ts-check
/**
 * @file playwright/tests/U63-import-export.spec.js
 *
 * Import & export — OMP suite, one test per canonical scenario the spec
 * runs on a press: S1–S4 (common), S5, S6, S11 and S12 {OJS OMP}, in the
 * press's own words: the Press Manager, a monograph, the Native XML tabs
 * "Import" and "Export", the list "Monographs" with "Export Submissions",
 * the results tab "Results", the "Press Registration" email, the "Series
 * editor" and "External Reviewer" roles. S7–S10 are the journal's (PubMed,
 * DOAJ); the journal-only bullets inside the common scenarios ("Export
 * Issues", the unknown issue, "DOAJ Plugin" unticked, the "Sections"
 * filter group) have no press leg here; the press's own legs ride in them:
 * S3's ONIX reminder (OMP2) and "Internal Review" stage, S4's unknown
 * series (OMP3). Everything runs in the parallel `omp` project: every
 * scenario but S2 seeds its own scratch presses.
 * Spec: docs/specs/U63-import-export.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - OMP1 🐞: S1 never presses "Tab Delimited Content Import Plugin".
 * - A8 🐞: S4's "Errors occured:" lines under a successful import are left
 *   unread, the contributor's no-Country line aside.
 * - A10 🐞: S3's published monograph in no stage is read only as its
 *   absence from the stage filters' lists.
 * - A16 🐞: S6's and S12's imports take either form the server's PHP gives.
 * - A1, A4, A6, A7, A9, A11–A15, A19–A26, OMP4–OMP6: not on these
 *   scenarios' press paths. OJS1–OJS12: the journal's.
 *
 * Seeding (footnote sc): S2 reads `publicknowledge` with the roster; every
 * other scenario seeds its own scratch presses with `POST
 * scenarios/context` (a principal contact, a throwaway Press Manager named
 * in both presses of S1, S4 and S6; the editor's `permitSettings: false`
 * in S1; S4's three statements at `request`; S6's fern `masthead: {author:
 * false}`; S12's rook a `sectionEditor`) and `POST scenarios/submission`
 * (`files[]`, `reviewRounds[].files[]`, `decisions[]`, `published`). A new
 * press has its ONIX details blank (S3). Two test-side workarounds the
 * footnote names: S4's three statements are put on A's copy through the
 * publications API (`putPublication`), and S6's moss is made in A by a
 * users import giving its Copyeditor role a past start. The files a test
 * imports are written by the test into its own output folder, from an
 * export it made on screen (S4, the series file by `nativeWithSeries`) or
 * by `usersXmlFile` (S5, S6, S11, S12). Scratch names ("kiwi", "moss",
 * "ash", "quill") carry the test's tag.
 *
 * Every absence is read settled (the list's own fetch, the landing after
 * an action) and paired with a positive control taken the same way (M4,
 * M6); the mail catcher's silence is bounded by a message the test sends
 * or expects (A8). No results tab is ever pressed again (spec Rule 9: it
 * would import the file once more). Waits are web-first or bounded by the
 * screen's own answer (A5).
 */
const fs = require('fs');
const {test, expect} = require('../support/fixtures.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {EditorialDashboardPage} = require('../../../../shared/playwright/pages/EditorialDashboardPage.js');
const {UsersListPage} = require('../../../../shared/playwright/pages/UsersManagementPages.js');
const {SectionsTab} = require('../../../../shared/playwright/pages/SectionsPages.js');
const {
    ToolsPage,
    NativeXmlPage,
    UsersXmlPage,
    recordToolNotices,
    downloadFrom,
    sideMenuEntry,
    expectSideMenu,
    deniedSentence,
    resultLines,
    usersXmlFile,
    usersInFile,
    expectEveryUserImported,
    md5,
    nativeWithUnknownElement,
    nativeWithSeries,
    UserRolesPage,
    putPublication,
    whole,
    loose,
} = require('../../../../shared/playwright/pages/ImportExportPages.js');
const {AboutPages} = require('../../../../shared/playwright/pages/ContextIdentityPages.js');

const T = 30_000;
const PRESS = 'publicknowledge';

// ---- the OMP words ------------------------------------------------------------------
/** Native XML Plugin's labels on a press (Fields). */
const NATIVE = {exportTab: 'Export', exportButton: 'Export Submissions', importResults: 'Results'};
/** The Tools list's lines, in no fixed order (Rule 2; Fields; T-ojs-2). */
const TOOL_LINES = [
    "Native XML Plugin: Import and export books in OMP's native XML format.",
    'Tab Delimited Content Import Plugin: Import submissions into presses from tab delimited data.',
    'Users XML Plugin: Import and export users',
    'ONIX 3.0 Monograph Export Plugin: Export monograph metadata in the ONIX 3.0 format',
];
const TOOL_NAMES = TOOL_LINES.map((l) => l.slice(0, l.indexOf(':')));
const STAGES = ['Submission', 'Internal Review', 'External Review', 'Copyediting', 'Production'];
const EXPORTED = 'The export completed successfully. Download the exported file from the button below.';
const IMPORTED = 'The import completed successfully. The following items were imported:';
const FAILED = 'The process failed. Check below for errors/warnings.';
const USERS_IMPORTED =
    'The import completed successfully. Users with usernames and email addresses that are not already in use have been imported, along with accompanying user groups.';
/** The success sentence as the whole panel (the press's panel spaces its two sentences apart). */
const USERS_IMPORTED_WHOLE = new RegExp(`^\\s*${USERS_IMPORTED.replace(/[.]/g, '\\.').replace(/ /g, '\\s+')}\\s*$`);
const USERS_INTRO =
    'Select an XML data file containing user information to import into this press. See the press help for details on the format of this file.';
const USERS_NOTE =
    'Note that if the imported file contains any usernames or email addresses that already exist in the system, the user data for those users will not be imported and any new roles to be created will be assigned to the existing users.';
const NEW_PASSWORD_SENT = (u) =>
    `The imported user "${u}" password could not be imported as is. A new password is been send to the user email. The user has been imported.`;
const ROLE_HELD = (u, g) =>
    `The role "${g}" of the user "${u}" has not been imported because the user already holds this role in an overlapping period.`;
const INVALID_DATE = (u, g, d) => `The role "${g}" of the user "${u}" has not been imported because "${d}" is not a valid date.`;
const BAD_PERIOD = (u, g) => `The role "${g}" of the user "${u}" has not been imported because its start date is not before its end date.`;
const SKIPPED_FILE = (n) =>
    `The submission file ${n} was skipped because it is attached to a record that will not be imported, such as a review assignment or discussion.`;
const NO_COUNTRY = (name) => `The author ${name} does not have a country.`;
const NO_MATCH = (u, e) => `The username "${u}" and the e-mail "${e}" do not match to the one and the same existing user.`;
const ONIX_REMINDER =
    'This press is missing some required information for ONIX metadata used in this export. Please go to Press Settings and fill in the missing details.';

const OKAPI = 'Okapi field notes';
const QUOKKA = 'Quokka survey';
const AXOLOTL = 'Axolotl limb memory';
const WOMBAT = 'Wombat notes';
const ZED = {path: 'zzz', title: 'Zed Series'};
/** The press's role names (Fields; users.md): "Section editor" and the reviewer role on a press. */
const SERIES_EDITOR = 'Series editor';
const REVIEWER = 'External Reviewer';
/** The three statements of S4, each as A holds it (Rule 20a): bold, italics, a link and "&". */
const STATEMENT = '<p>Okapi <strong>notes</strong> <em>in the field</em>, see <a href="https://pkp.sfu.ca">PKP</a> &amp; more</p>';
const STATEMENT_TEXT = 'Okapi notes in the field, see PKP & more';
/** Each statement's Publication page and box on a press (U40). */
const STATEMENT_PAGES = [
    {key: 'plainLanguageSummary', page: 'Title & Abstract', label: /^Plain Language Summary/},
    {key: 'dataAvailability', page: 'Data', label: /^Data Availability Statement/},
    {key: 'fundingStatement', page: 'Funding', label: /^Funding Statement/},
];
/** The password of every user of the S11 and S12 files. */
const ROLE_PASS = 'rolepass1';

/** Today on the server, in UTC (`YYYY-MM-DD`): the day of an import (footnote sc). */
const today = () => new Date().toISOString().slice(0, 10);

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u63${scenario}omw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: mailOf(username), roles};
}

/** A scratch press's principal contact (footnote sc). */
const contact = (tag) => ({contactName: 'Pat Contact', contactEmail: mailOf(`${tag}pc`), country: 'CA'});

/** A page as `username`, recording the notices at the top right. */
async function pageAs(asUser, username) {
    const page = await (await asUser(username)).newPage();
    await recordToolNotices(page);
    return page;
}

/** A browser with nobody signed in (an explicit empty state, patterns.md lesson 8). */
async function freshPage(browser, baseURL) {
    const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
    const page = await context.newPage();
    await recordToolNotices(page);
    return page;
}

/**
 * Sign in through a press's login form in a fresh browser (the form
 * replaces a seeded account's stored password, footnote sc); returns the
 * signed-in page.
 */
async function signInByForm(browser, baseURL, contextPath, username, password = `${username}${username}`) {
    const page = await freshPage(browser, baseURL);
    const login = new LoginPage(page);
    await login.gotoContext(contextPath);
    await login.signIn(username, password);
    return page;
}

/**
 * The mail catcher's silence for `others`, bounded by a positive control:
 * a password reset for the press's own manager, asked on the press's
 * "Forgot your password?" page after the actions (A8). The manager's inbox
 * then holds that one message and nothing else.
 */
async function expectNoMailBesidesControl(browser, baseURL, pkpMail, tag, manager, others) {
    const visitor = await freshPage(browser, baseURL);
    await visitor.goto(`/index.php/${tag}/login/lostPassword`);
    await visitor.locator('form#lostPasswordForm input#email').fill(mailOf(manager));
    await visitor.locator('form#lostPasswordForm').getByRole('button', {name: 'Reset Password'}).click();
    await pkpMail.find({to: mailOf(manager), subject: 'Password Reset Confirmation'});
    expect(await pkpMail.count({to: mailOf(manager)}), 'the manager received the control alone').toBe(1);
    for (const other of others) {
        expect(await pkpMail.count({to: mailOf(other)}), `no mail to ${other}`).toBe(0);
    }
    await visitor.context().close();
}

/**
 * The sidebar's global search on a press's Dashboard (every status);
 * resolves once the list answered the phrase.
 */
async function dashboardSearch(dashboard, phrase) {
    const answered = dashboard.page.waitForResponse(
        (r) => /\/api\/v1\/_submissions/.test(r.url()) && r.url().includes(`searchPhrase=${encodeURIComponent(phrase)}`),
        {timeout: T}
    );
    await dashboard.globalSearch(phrase);
    await answered;
}

/**
 * A user of the S11 and S12 files: a new account with the plain password
 * "rolepass1" (or the one given), its roles as `usersXmlFile` takes them
 * (a name, or `{name, start, end, masthead}`).
 */
function fileUser(username, givenName, roles, password = ROLE_PASS) {
    return {givenName, familyName: 'Rolefile', email: mailOf(username), username, password: {plain: password}, roles};
}

/** The display name the press's lists print for a `fileUser`. */
const fileName = (givenName) => `${givenName} Rolefile`;

/**
 * The rich-text box of a Publication page's field, by its label (the
 * submission-language column's TinyMCE body).
 */
function richBody(page, labelRe) {
    return page
        .locator('.pkpFormField')
        .filter({has: page.locator('label.pkpFormFieldLabel').filter({hasText: labelRe})})
        .frameLocator('iframe')
        .first()
        .locator('body');
}

/**
 * Open a user's roles page from Settings › Users & Roles › "Users" ("Edit"
 * on the row of `email`), the list opened first.
 */
async function openRolesPage(list, email) {
    await list.goto();
    await expect(list.row(email)).toHaveCount(1, {timeout: T});
    const roles = new UserRolesPage(list.page);
    await roles.openFrom(list, email);
    return roles;
}

test.describe('Import & export', () => {
    test("S1: the Tools page, its list and a tool's page", async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(180_000);
        const tag = makeTag('s1', testInfo);
        const manager = `${tag}mg`;
        const editor = `${tag}ed`;
        await ompApi.createContext({
            tag,
            context: contact(tag),
            users: [user(manager, 'Mona', 'Manager', ['manager']), user(editor, 'Edda', 'Editor', ['editor'])],
            roles: {editor: {permitSettings: false}},
        });
        const page = await pageAs(asUser, manager);
        const tools = new ToolsPage(page, tag);

        // The Tools page from the side menu: "Import/Export" (open) and
        // "Permissions" (Rule 1).
        await page.goto(`/index.php/${tag}/dashboard/editorial`);
        await expectSideMenu(page);
        await sideMenuEntry(page, 'Tools').click();
        await expect(page).toHaveURL(new RegExp(`/index\\.php/${tag}/management/tools`));
        await tools.expectLoaded();
        await expect(tools.tabs()).toHaveText(['Import/Export', 'Permissions']);
        await expect(tools.tab('Import/Export')).toHaveAttribute('aria-selected', 'true');

        // The list: one line per tool, its name a link, then a colon and its
        // description (Rule 2; Fields). Control: "Users XML Plugin" is there
        // (Purpose). "Tab Delimited Content Import Plugin" is not pressed (OMP1).
        await tools.expectLineSet(TOOL_LINES);
        for (const name of TOOL_NAMES) {
            await expect(tools.toolLink(name), name).toBeVisible();
        }

        // A tool's page: heading, trail, tabs, the "Import" box; the trail's
        // "Tools" returns (Rules 4, 7; Fields).
        await tools.openTool('Native XML Plugin');
        const native = new NativeXmlPage(page, tag, NATIVE);
        await expect(native.trail()).toHaveText(/^\s*Tools\s*\/\s*Native XML Plugin\s*$/);
        await expect(native.trailToolsLink()).toBeVisible();
        await native.expectTabs(['Import', 'Export']);
        await native.expectSelected('Import');
        await expect(native.uploadHeading()).toBeVisible();
        await expect(native.uploadButton()).toBeVisible();
        await expect(native.dropHint()).toBeVisible();
        await expect(native.importButton()).toBeVisible();
        await native.trailToolsLink().click();
        await tools.expectLoaded();
        await tools.expectLineSet(TOOL_LINES);

        // The Editor without "Permit changes to Settings": "Tools" in the
        // side menu, the same list, the Native XML page (Actors rows 1–2;
        // Settings bullet 1).
        const edPage = await pageAs(asUser, editor);
        await edPage.goto(`/index.php/${tag}/dashboard/editorial`);
        await expectSideMenu(edPage);
        await sideMenuEntry(edPage, 'Tools').click();
        const edTools = new ToolsPage(edPage, tag);
        await edTools.expectLoaded();
        await edTools.expectLineSet(TOOL_LINES);
        await edTools.openTool('Native XML Plugin');
        await new NativeXmlPage(edPage, tag, NATIVE).expectTabs(['Import', 'Export']);
    });

    test('S2: roles kept off the Tools page', async ({browser, baseURL, asUser}) => {
        test.setTimeout(180_000);
        const toolsUrl = `/index.php/${PRESS}/management/tools`;
        const nativeUrl = `/index.php/${PRESS}/management/importexport/plugin/NativeImportExportPlugin`;

        // The Series Editor: no "Tools" in the side menu (its other entries
        // on screen); both addresses answer the access-denied page (Actors
        // rows 1–2).
        const ana = await pageAs(asUser, 'sectioneditor.ana');
        await ana.goto(`/index.php/${PRESS}/user/profile`);
        await expectSideMenu(ana);
        await expect(sideMenuEntry(ana, 'Start A New Submission')).toHaveCount(1);
        await expect(sideMenuEntry(ana, 'Tools')).toHaveCount(0);
        for (const url of [toolsUrl, nativeUrl]) {
            await ana.goto(url);
            await expect(deniedSentence(ana), url).toBeVisible();
        }

        // Copyeditor, Reviewer, Author, Reader: the same page at both
        // addresses (Actors rows 1–2).
        for (const username of ['copyeditor.carla', 'reviewer.julia', 'author.alex', 'reader.rosa']) {
            const page = await pageAs(asUser, username);
            for (const url of [toolsUrl, nativeUrl]) {
                await page.goto(url);
                await expect(deniedSentence(page), `${username} at ${url}`).toBeVisible();
                await expect(page.locator('.pkp_page_importexport_plugins'), `${username} at ${url}`).toHaveCount(0);
            }
        }

        // Signed out: the Login page (Actors row 1).
        const visitor = await freshPage(browser, baseURL);
        await visitor.goto(toolsUrl);
        await expect(visitor).toHaveURL(/\/login/);
        await new LoginPage(visitor).expectForm();
        await visitor.context().close();

        // Control: the Press Manager opens both (Actors rows 1–2).
        const maya = await pageAs(asUser, 'manager.maya');
        const tools = new ToolsPage(maya, PRESS);
        await tools.goto();
        await expect(tools.tab('Import/Export')).toHaveAttribute('aria-selected', 'true');
        await expect(tools.line('Native XML Plugin')).toBeVisible();
        const native = new NativeXmlPage(maya, PRESS, NATIVE);
        await native.goto();
        await native.expectSelected('Import');
    });

    test('S3: exporting submissions', async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s3', testInfo);
        const manager = `${tag}mg`;
        const ada = `${tag}al`;
        await ompApi.createContext({
            tag,
            context: contact(tag),
            users: [user(manager, 'Mona', 'Manager', ['manager']), user(ada, 'Ada', 'Lovelace', ['author'])],
        });
        const okapi = await ompApi.createSubmission({tag: `${tag}ok`, context: tag, submitter: ada, title: OKAPI});
        const quokka = await ompApi.createSubmission({
            tag: `${tag}qu`,
            context: tag,
            submitter: ada,
            title: QUOKKA,
            decisions: ['sendExternalReview'],
            reviewRounds: [{files: [{file: 'article.pdf'}]}],
        });
        const reviewFile = (quokka.files || []).find((f) => f.reviewRoundId);
        expect(reviewFile, 'the seeded file under "Files for Review"').toBeTruthy();
        await ompApi.createSubmission({tag: `${tag}ax`, context: tag, submitter: ada, title: AXOLOTL, published: true});
        const page = await pageAs(asUser, manager);
        const native = new NativeXmlPage(page, tag, NATIVE);
        const list = native.list;

        // The export tab: the list titled "Monographs" with its search box
        // and "Filters"; three lines, each a box, the title and "View";
        // "Select All" and "Export Submissions" under it (Rule 14; Fields).
        await native.goto();
        await native.openExportTab();
        await expect(list.title()).toHaveText('Monographs');
        await expect(list.searchBox()).toBeVisible();
        await expect(list.filtersButton()).toBeVisible();
        await list.expectTitles([OKAPI, QUOKKA, AXOLOTL]);
        for (const title of [OKAPI, QUOKKA, AXOLOTL]) {
            await expect(list.box(title), title).not.toBeChecked();
            await expect(list.viewLink(title), title).toBeVisible();
        }
        await expect(list.selectButton()).toHaveText('Select All');
        await expect(list.exportButton()).toBeVisible();

        // The ONIX reminder: the sentence, "Press Settings" a link to
        // Settings › Press (Rule 19; Settings bullet 7; OMP2).
        await expect(list.panel).toContainText(ONIX_REMINDER);
        await expect(list.panel.getByRole('link', {name: 'Press Settings', exact: true})).toHaveAttribute(
            'href',
            new RegExp(`/index\\.php/${tag}/(en/)?management/settings/context$`)
        );

        // "Select All": every line ticked, "Select None"; pressed, every line
        // unticked (Rule 15).
        await list.selectButton().click();
        for (const title of [OKAPI, QUOKKA, AXOLOTL]) await expect(list.box(title), title).toBeChecked();
        await expect(list.selectButton()).toHaveText('Select None');
        await list.selectButton().click();
        for (const title of [OKAPI, QUOKKA, AXOLOTL]) await expect(list.box(title), title).not.toBeChecked();
        await expect(list.selectButton()).toHaveText('Select All');

        // Exporting two: "Export Submissions Results" with the sentence and
        // "Download Exported File"; the file holds the two (Rule 16).
        await list.box(OKAPI).check();
        await list.box(AXOLOTL).check();
        const results = await list.pressExport(native);
        await expect(results).toContainText(EXPORTED);
        await expect(native.downloadButton(results)).toBeVisible();
        const file = await native.download(results);
        expect(file.name).toMatch(/\.xml$/);
        expect(file.text).toContain(OKAPI);
        expect(file.text).toContain(AXOLOTL);

        // "Close": the tab goes; "Export" shows (Fields).
        await native.closeResultsTab('Export Submissions Results');
        await native.expectTabs(['Import', 'Export']);
        await native.expectSelected('Export');

        // A file under "Files for Review": "Select All", "Select None",
        // "Quokka survey" ticked and exported: a new "Export Submissions
        // Results" tab with the sentence, then "Warnings encountered:",
        // "Submission" and the skipped-file line naming that file's number;
        // the file still downloads (Rules 15, 16a).
        await native.openExportTab();
        await list.selectButton().click();
        await expect(list.selectButton()).toHaveText('Select None');
        await list.selectButton().click();
        for (const title of [OKAPI, QUOKKA, AXOLOTL]) await expect(list.box(title), title).not.toBeChecked();
        await list.box(QUOKKA).check();
        const reviewResults = await list.pressExport(native);
        await expect(native.tabsNamed('Export Submissions Results')).toHaveCount(1);
        await expect(reviewResults).toContainText(EXPORTED);
        await expect(reviewResults).toHaveText(
            new RegExp(`${loose(EXPORTED)}[\\s\\S]*Warnings encountered:\\s*Submission\\s*${loose(SKIPPED_FILE(reviewFile.submissionFileId))}`)
        );
        await expect(resultLines(reviewResults).filter({hasText: whole(SKIPPED_FILE(reviewFile.submissionFileId))})).toHaveCount(1);
        const reviewExport = await native.download(reviewResults);
        expect(reviewExport.name).toMatch(/\.xml$/);
        expect(reviewExport.text).toContain(QUOKKA);
        await native.openExportTab();

        // "Filters": the panel's groups and buttons, no "Sections" group on a
        // press; "External Review", then "Submission" too (Rule 14a; Fields).
        // The published monograph matches no stage (A10, read as the lists'
        // sets).
        await list.openFilters();
        await expect(list.sidebarHeadings()).toHaveText(['Stages', 'Activity']);
        for (const stage of STAGES) {
            await expect(list.filterButton(stage), stage).toBeVisible();
        }
        await expect(list.addActivityFilterButton()).toBeVisible();
        await expect(list.sidebar().getByRole('slider', {name: 'Days since last activity', exact: true})).toBeVisible();
        await list.pressFilter('External Review');
        await list.expectTitles([QUOKKA]);
        await list.pressFilter('Submission');
        await list.expectTitles([OKAPI, QUOKKA]);

        // Search: typed, nothing changes until Enter; Enter: "Okapi field
        // notes" alone; its "View" opens its workflow (Rule 14).
        const searched = [];
        page.on('request', (r) => {
            if (/\/api\/v1\/submissions\?/.test(r.url()) && r.url().includes('searchPhrase=')) searched.push(r.url());
        });
        await list.typeSearch('Okapi');
        await expect(list.searchBox()).toHaveValue('Okapi');
        await list.expectTitles([OKAPI, QUOKKA]);
        expect(searched, 'no search sent before Enter').toEqual([]);
        await list.commitSearch();
        await list.expectTitles([OKAPI]);
        await list.viewLink(OKAPI).click();
        const workflow = new WorkflowPage(page, tag);
        await workflow.expectOpen(okapi.submissionId);
        await expect(workflow.titleLine()).toContainText(OKAPI);

        // Control: the downloaded file holds no "Quokka survey" (Rule 16).
        expect(file.text).not.toContain(QUOKKA);
    });

    test('S4: importing submissions from another press', async ({browser, baseURL, asUser, ompApi, pkpMail}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        const a = `${tag}a`;
        const b = `${tag}b`;
        const manager = `${tag}mg`;
        const ada = `${tag}al`;
        // Both presses with the three statements enabled (Rule 20a); the
        // submitter's account has no country, so neither has its
        // contributor record (footnote sc; Rule 12).
        const metadata = {plainLanguageSummary: 'request', dataAvailability: 'request', fundingStatement: 'request'};
        await ompApi.createContext({
            tag: a,
            context: contact(a),
            metadata,
            users: [user(manager, 'Mona', 'Manager', ['manager']), user(ada, 'Ada', 'Lovelace', ['author'])],
        });
        await ompApi.createContext({tag: b, context: contact(b), metadata, users: [{username: manager, roles: ['manager']}]});
        const okapi = await ompApi.createSubmission({tag: `${a}ok`, context: a, submitter: ada, title: OKAPI, files: [{file: 'article.pdf'}]});
        const page = await pageAs(asUser, manager);
        // The three statements put on A's copy through the publications API,
        // since no submission key sets them (footnote sc, the way
        // checks/sync/pkp-lib-13377/roundtrip.js puts them).
        await page.goto(`/index.php/${a}/dashboard/editorial`);
        await expectSideMenu(page);
        const put = await putPublication(page, a, okapi, Object.fromEntries(STATEMENT_PAGES.map(({key}) => [key, {en: STATEMENT}])));
        expect(put.status, JSON.stringify(put.body).slice(0, 300)).toBe(200);
        for (const {key} of STATEMENT_PAGES) expect(put.body[key]?.en, key).toBe(STATEMENT);
        // Dashboard and settings reads go through a second page, so the
        // Native page's upload box keeps its file between the imports
        // (Rule 8).
        const side = await page.context().newPage();

        // A's file: "Okapi field notes" exported and downloaded (Rule 16).
        const nativeA = new NativeXmlPage(page, a, NATIVE);
        await nativeA.goto();
        await nativeA.openExportTab();
        await nativeA.list.box(OKAPI).check();
        const exported = await nativeA.list.pressExport(nativeA);
        const file = await nativeA.download(exported);
        expect(file.name).toMatch(/\.xml$/);
        const okapiFile = testInfo.outputPath('okapi-from-a.xml');
        fs.writeFileSync(okapiFile, file.text);
        // The two further files, written from A's (footnote sc).
        const seriesFile = testInfo.outputPath('okapi-series-zzz.xml');
        fs.writeFileSync(seriesFile, nativeWithSeries(file.text, {from: OKAPI, to: `${OKAPI} zzz`, ...ZED}));
        const wombatFile = testInfo.outputPath('wombat-unknown-element.xml');
        fs.writeFileSync(wombatFile, nativeWithUnknownElement(file.text, {element: 'monograph', from: OKAPI, to: WOMBAT}));

        // Choosing the file on B's "Import": its name in the box and "Change
        // File" (Rule 8).
        const nativeB = new NativeXmlPage(page, b, NATIVE);
        await nativeB.goto();
        await nativeB.expectSelected('Import');
        await nativeB.upload(okapiFile);
        await expect(nativeB.importForm()).toContainText('okapi-from-a.xml');
        await expect(nativeB.changeFileButton()).toBeVisible();

        // "Import": "Results" with the success text and the line
        // ""{number}" - "Okapi field notes"" (Rules 9, 10). A8's error lines
        // are left unread.
        const imported = await nativeB.pressImport();
        await expect(imported).toContainText(IMPORTED);
        const itemLine = resultLines(imported).filter({hasText: new RegExp(`^\\s*"\\d+" - "${OKAPI}"\\s*$`)});
        await expect(itemLine).toHaveCount(1);
        const number = Number(((await itemLine.innerText()).match(/"(\d+)"/) || [])[1]);
        expect(number).toBeGreaterThan(0);

        // The contributor with no Country: among the lines under the success
        // text, "The author {name} does not have a country.", {name} the
        // contributor's given name alone (Rule 12).
        await expect(resultLines(imported).filter({hasText: whole(NO_COUNTRY('Ada'))})).toHaveCount(1);

        // B's Dashboard: "Okapi field notes" under that number in
        // "Submission"; its workflow shows the contributor and the file
        // (Rule 10).
        const dashB = new EditorialDashboardPage(side, b);
        await dashB.goto();
        await dashboardSearch(dashB, 'Okapi');
        const row = dashB.row(OKAPI);
        await expect(row).toHaveCount(1);
        await expect(row.getByRole('cell').first()).toHaveText(new RegExp(`^\\s*${number}\\s*$`));
        await expect(dashB.stageCell(row)).toContainText('Submission');
        const workflow = new WorkflowPage(side, b);
        await workflow.gotoEditorial(number);
        await expect(workflow.contributorsLine()).toContainText('Lovelace');
        await expect(workflow.dialog().getByText('article.pdf', {exact: true})).toBeVisible({timeout: T});

        // The three statements on the copy's Publication pages, as in A: the
        // bold, the italics, the link and "&" (Rule 20a).
        for (const {page: entry, label} of STATEMENT_PAGES) {
            await workflow.selectPage(entry);
            const body = richBody(side, label);
            await expect(body, entry).toHaveText(STATEMENT_TEXT, {timeout: T});
            await expect(body.locator('strong'), entry).toHaveText('notes');
            await expect(body.locator('em'), entry).toHaveText('in the field');
            await expect(body.locator('a'), entry).toHaveText('PKP');
            await expect(body.locator('a'), entry).toHaveAttribute('href', 'https://pkp.sfu.ca');
        }

        // An unknown series: before, B's Settings › Press › "Series" has no
        // "Zed Series"; another "Results" tab with the success text, then
        // "Warnings encountered:" and "Unknown series zzz"; B's "Series" now
        // lists "Zed Series" (Rule 12a; OMP3).
        const seriesB = new SectionsTab(side, b, {tab: 'Series', addLabel: 'Add Series'});
        await seriesB.goto();
        await expect(seriesB.heading()).toBeVisible();
        await expect(seriesB.row(ZED.title)).toHaveCount(0);
        await nativeB.openTab('Import');
        await expect(nativeB.changeFileButton()).toBeVisible();
        await nativeB.upload(seriesFile);
        const seriesResults = await nativeB.pressImport();
        await expect(nativeB.tabsNamed(NATIVE.importResults)).toHaveCount(2);
        await expect(seriesResults).toContainText(IMPORTED);
        await expect(seriesResults).toHaveText(/Warnings encountered:[\s\S]*Unknown series zzz/);
        await expect(resultLines(seriesResults).filter({hasText: 'Unknown series zzz'})).toHaveCount(1);
        await seriesB.goto();
        await expect(seriesB.row(ZED.title)).toHaveCount(1);

        // A file that does not match the format: "The process failed…", then
        // "Errors occured:" and "Validation errors:", each with lines; no
        // "Wombat notes" on B's Dashboard (Rule 11).
        await nativeB.openTab('Import');
        await nativeB.upload(wombatFile);
        const failed = await nativeB.pressImport();
        await expect(nativeB.tabsNamed(NATIVE.importResults)).toHaveCount(3);
        await expect(failed).toContainText(FAILED);
        await expect(failed).toHaveText(/The process failed\. Check below for errors\/warnings\.\s*Errors occured:\s*\S[\s\S]*Validation errors:\s*\S/);
        await expect(failed.locator('h2').filter({hasText: /^\s*Validation errors:\s*$/}).locator('+ ul > li').first()).toBeVisible();
        await dashB.goto();
        await dashboardSearch(dashB, 'Okapi');
        await expect(dashB.row(OKAPI).first()).toBeVisible();
        await dashboardSearch(dashB, 'Wombat');
        await expect(dashB.row(WOMBAT)).toHaveCount(0);

        // Control: A's Dashboard still lists "Okapi field notes" in
        // "Submission" (Side effects bullet 3); no email from the import
        // (Rule 10; Side effects bullet 1).
        const dashA = new EditorialDashboardPage(side, a);
        await dashA.goto();
        await dashboardSearch(dashA, 'Okapi');
        const rowA = dashA.row(OKAPI);
        await expect(rowA).toHaveCount(1);
        await expect(rowA.getByRole('cell').first()).toHaveText(new RegExp(`^\\s*${okapi.submissionId}\\s*$`));
        await expect(dashA.stageCell(rowA)).toContainText('Submission');
        await expectNoMailBesidesControl(browser, baseURL, pkpMail, a, manager, [ada]);
    });

    test('S5: importing users', async ({browser, baseURL, asUser, ompApi, pkpMail}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s5', testInfo);
        const manager = `${tag}mg`;
        const kiwi = `${tag}kiwi`;
        const nova = `${tag}nova`;
        const wren = `${tag}wren`;
        const tui = `${tag}tui`;
        const kiwiOther = `${tag}kiwi.other@mail.test`;
        await ompApi.createContext({
            tag,
            context: contact(tag),
            users: [user(manager, 'Mona', 'Manager', ['manager']), user(kiwi, 'Kiwi', 'Author', ['author'])],
        });
        const first = testInfo.outputPath('users-first.xml');
        fs.writeFileSync(
            first,
            usersXmlFile([
                {givenName: 'Nova', familyName: 'New', email: mailOf(nova), username: nova, password: {plain: 'novapass1'}, roles: ['Copyeditor', 'Reader', 'Quokka Wrangler']},
            ])
        );
        const second = testInfo.outputPath('users-second.xml');
        fs.writeFileSync(
            second,
            usersXmlFile([
                {givenName: 'Wren', familyName: 'Hashed', email: mailOf(wren), username: wren, password: {encryption: 'md5', hash: md5('wrenpass12')}, roles: ['Reader']},
                {givenName: 'Kiwi', familyName: 'Other', email: kiwiOther, username: kiwi, password: {plain: 'kiwipass12'}, roles: ['Reader']},
                {givenName: 'Tui', familyName: 'Plain', email: mailOf(tui), username: tui, password: {plain: 'tuipass12'}, roles: ['Reader']},
            ])
        );
        const page = await pageAs(asUser, manager);
        const side = await page.context().newPage();
        const users = new UsersXmlPage(page, tag);

        // The page: "Import Users" (open) and "Export Users"; the two
        // paragraphs in the press's words, the "File" box and "Import Users"
        // (Rule 21; Fields).
        await users.goto();
        await users.expectTabs(['Import Users', 'Export Users']);
        await users.expectSelected('Import Users');
        await expect(users.visiblePanel()).toContainText(USERS_INTRO);
        await expect(users.visiblePanel()).toContainText(USERS_NOTE);
        await expect(users.fileHeading()).toBeVisible();
        await expect(users.uploadButton()).toBeVisible();
        await expect(users.importButton()).toBeVisible();

        // The first file: its name and "Change File"; "Import Users": a
        // "Results" tab with the success sentence (Rule 22).
        await users.upload(first);
        await expect(users.importForm()).toContainText('users-first.xml');
        await expect(users.changeFileButton()).toBeVisible();
        const firstResults = await users.pressImport();
        await expect(firstResults).toHaveText(USERS_IMPORTED_WHOLE);

        // nova: "Copyeditor" and "Reader" and no other (Rules 23, 24).
        const list = new UsersListPage(side, tag);
        await list.goto();
        await expect(list.row(mailOf(nova))).toHaveCount(1);
        expect((await list.cellLines(list.rolesCell(list.row(mailOf(nova))))).sort()).toEqual(['Copyeditor', 'Reader']);

        // nova signs in with "novapass1" (Rule 25).
        const novaPage = await signInByForm(browser, baseURL, tag, nova, 'novapass1');
        await expect(novaPage).not.toHaveURL(/\/login/);
        await novaPage.context().close();

        // The second file: a second "Results" tab, "Import/Export errors:"
        // with wren's and kiwi's lines and no success sentence (Rules 22,
        // 23, 25).
        await users.openTab('Import Users');
        await expect(users.changeFileButton()).toBeVisible();
        await users.upload(second);
        const secondResults = await users.pressImport();
        await expect(users.tabsNamed('Results')).toHaveCount(2);
        await expect(secondResults.getByRole('heading', {name: 'Import/Export errors:', exact: true})).toBeVisible();
        await expect(resultLines(secondResults)).toHaveText([NEW_PASSWORD_SENT(wren), NO_MATCH(kiwi, kiwiOther)]);
        await expect(secondResults).not.toContainText('The import completed successfully.');

        // The accounts: wren and tui with "Reader"; kiwi unchanged, "Author"
        // alone; no account with kiwi's other address (Rules 22, 23).
        await list.goto();
        for (const who of [wren, tui]) {
            await expect(list.row(mailOf(who)), who).toHaveCount(1);
            expect(await list.cellLines(list.rolesCell(list.row(mailOf(who)))), who).toEqual(['Reader']);
        }
        const kiwiRow = list.row(mailOf(kiwi));
        await expect(kiwiRow).toHaveCount(1);
        await expect(list.emailCell(kiwiRow)).toHaveText(new RegExp(`^\\s*${mailOf(kiwi).replace(/[.]/g, '\\.')}\\s*$`));
        expect(await list.cellLines(list.rolesCell(kiwiRow))).toEqual(['Author']);
        await expect(list.row(kiwiOther)).toHaveCount(0);

        // The email: "Press Registration" to wren, from the Press Manager,
        // replying to the principal contact, with the new password (Actors
        // row 4; Rule 25; Side effects bullet 2).
        const message = await pkpMail.find({to: mailOf(wren), subject: 'Press Registration'});
        const full = await pkpMail.fullMessage(message.ID);
        expect(full.From.Address).toBe(mailOf(manager));
        expect((full.ReplyTo || []).map((r) => r.Address)).toEqual([mailOf(`${tag}pc`)]);
        const mailed = ((full.Text || '').match(/Password:\s*(\S+)/) || [])[1];
        expect(mailed, 'the email carries a password').toBeTruthy();

        // wren signs in with it: the account must change its password first
        // (Rule 25).
        const wrenPage = await freshPage(browser, baseURL);
        const login = new LoginPage(wrenPage);
        await login.gotoContext(tag);
        await login.submitCredentials(wren, /** @type {string} */ (mailed));
        await expect(wrenPage).toHaveURL(new RegExp(`/login/changePassword/${wren}`));
        await expect(wrenPage.getByRole('heading', {name: 'Change Password', exact: true})).toBeVisible();
        await wrenPage.context().close();

        // Control: no email to nova, tui, kiwi or the manager, wren's having
        // arrived (Actors row 4).
        for (const who of [nova, tui, kiwi, manager]) {
            expect(await pkpMail.count({to: mailOf(who)}), `no mail to ${who}`).toBe(0);
        }
    });

    test('S6: moving users from one press to another', async ({browser, baseURL, ompApi, pkpMail}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s6', testInfo);
        const a = `${tag}a`;
        const b = `${tag}b`;
        const manager = `${tag}mg`;
        const moss = `${tag}moss`;
        const fern = `${tag}fern`;
        // fern's Author role "Does not appear on the masthead" (footnote sc).
        await ompApi.createContext({
            tag: a,
            context: contact(a),
            users: [user(manager, 'Mona', 'Manager', ['manager']), {...user(fern, 'Fern', 'Author', ['author']), masthead: {author: false}}],
        });
        // The manager's role in B must start in a later second than in A: equal
        // start dates read as "already imported" and the overlap line of
        // pkp/pkp-lib#13412 would not come (claim check S01, 2026-10-01).
        await new Promise((r) => setTimeout(r, 1100));
        await ompApi.createContext({tag: b, context: contact(b), users: [{username: manager, roles: ['manager']}]});
        const page = await signInByForm(browser, baseURL, a, manager);
        const users = new UsersXmlPage(page, a);
        // moss made in A by a users import on A's own "Import Users": a
        // Copyeditor since 1 January 2020, its password (the username twice)
        // in plain text, since no `users[]` key gives a current role a past
        // start (footnote sc; scenarios.md "Field shapes not built yet").
        const mossFile = testInfo.outputPath('users-moss-into-a.xml');
        fs.writeFileSync(mossFile, usersXmlFile([fileUser(moss, 'Moss', [{name: 'Copyeditor', start: '2020-01-01'}], `${moss}${moss}`)]));
        await users.goto();
        await users.upload(mossFile);
        await expectEveryUserImported(await users.pressImport(), {usernames: [moss], successText: USERS_IMPORTED, newPasswordLine: NEW_PASSWORD_SENT});
        // Every account signs in once through the login form (footnote sc).
        for (const who of [moss, fern]) {
            const once = await signInByForm(browser, baseURL, a, who);
            await expect(once).not.toHaveURL(/\/login/);
            await once.context().close();
        }

        // "Export Users": "Current Users" with "Search" and "Export All
        // Users", the columns, moss and fern, "Export Users" (Rule 26; Fields).
        await users.goto();
        await users.openExportTab();
        await expect(users.gridTitle()).toHaveText('Current Users');
        await expect(users.headerLinks()).toHaveText([/^\s*Search\s*$/, /^\s*Export All Users\s*$/]);
        await expect(users.columns()).toHaveText(['Select', 'Given Name', 'Family Name', 'Username', /^\s*Email( address)?\s*$/]); // "Email" or "Email address": the duplicate user.email key (U41 A19)
        await expect(users.row(mailOf(moss))).toHaveCount(1);
        await expect(users.row(mailOf(fern))).toHaveCount(1);
        await expect(users.exportUsersButton()).toBeVisible();

        // The filter: shown; by text, by role, all roles again; hidden again
        // (Rule 26; Fields).
        await users.toggleFilter();
        await expect(users.filterForm()).toBeVisible();
        await expect(users.filterText()).toBeVisible();
        await expect(users.filterRole().locator('option:checked')).toHaveText('All Roles');
        await expect(users.filterSearchButton()).toBeVisible();
        await users.search({text: moss});
        await expect(users.row(mailOf(moss))).toHaveCount(1);
        await expect(users.rows()).toHaveCount(1);
        await users.search({text: '', role: 'Author'});
        await expect(users.row(mailOf(fern))).toHaveCount(1);
        await expect(users.row(mailOf(moss))).toHaveCount(0);
        await users.search({text: '', role: 'All Roles'});
        await expect(users.row(mailOf(moss))).toHaveCount(1);
        await expect(users.row(mailOf(fern))).toHaveCount(1);
        // The filter's own "Search" closes the filter (T-ojs-1): the header's
        // "Search" shows it, and pressed again hides it.
        if (!(await users.filterForm().isVisible())) {
            await users.toggleFilter();
            await expect(users.filterForm()).toBeVisible();
        }
        await users.toggleFilter();
        await expect(users.filterForm()).toBeHidden();

        // Ticked rows: moss alone in the file (Rule 27).
        const downloads = [];
        page.on('download', (d) => downloads.push(d.suggestedFilename()));
        await users.rowBox(mailOf(moss)).check();
        const ticked = await downloadFrom(page, () => users.exportUsersButton().click());
        expect(ticked.name).toMatch(/\.xml$/);
        expect(usersInFile(ticked.text).map((u) => u.username)).toEqual([moss]);

        // "Export All Users": "Confirm"; "Cancel" downloads nothing; "OK"
        // downloads every account the list holds, with their roles in A
        // (Rule 27). The one download after "OK" bounds the silence after
        // "Cancel".
        await users.exportAllLink().click();
        await expect(users.confirmWindow()).toBeVisible();
        await expect(users.confirmWindow().getByRole('heading', {name: 'Confirm', exact: true})).toBeVisible();
        await expect(users.confirmWindow()).toContainText('Are you sure you wish to export all users?');
        await users.confirmWindow().getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(users.confirmWindow()).toBeHidden();
        await users.openExportAllConfirm();
        const all = await downloadFrom(page, () => users.confirmWindow().getByRole('button', {name: 'OK', exact: true}).click());
        expect(downloads, 'one download: "OK"\'s, none after "Cancel"').toHaveLength(2);
        const listUsernames = await users.rows().evaluateAll((trs) => trs.map((tr) => (tr.querySelectorAll('td')[3]?.textContent || '').trim()));
        const inFile = usersInFile(all.text);
        expect(inFile.map((u) => u.username).sort()).toEqual(listUsernames.sort());
        expect(inFile.find((u) => u.username === moss)?.roles).toEqual(['Copyeditor']);
        expect(inFile.find((u) => u.username === fern)?.roles).toEqual(['Author']);
        const allFile = testInfo.outputPath('users-all-from-a.xml');
        fs.writeFileSync(allFile, all.text);

        // B's import: every account of the file imported (Rules 22, 28).
        const usersB = new UsersXmlPage(page, b);
        await usersB.goto();
        await usersB.upload(allFile);
        const results = await usersB.pressImport();
        // Every account of the file imported, in either of the two forms
        // the server's PHP decides (T-ojs-3): the success sentence, or the
        // "…could not be imported as is. … The user has been imported." line
        // for each account; with the line for the manager's role, which the
        // manager already holds in B (pkp/pkp-lib#13412).
        await expectEveryUserImported(results, {
            usernames: inFile.map((u) => /** @type {string} */ (u.username)),
            successText: USERS_IMPORTED,
            newPasswordLine: NEW_PASSWORD_SENT,
            otherLines: [ROLE_HELD(manager, 'Press manager')],
        });

        // B's users: moss Copyeditor, fern Author (Rules 23, 28).
        const listB = new UsersListPage(page, b);
        await listB.goto();
        await expect(listB.row(mailOf(moss))).toHaveCount(1);
        await expect(listB.row(mailOf(fern))).toHaveCount(1);
        expect(await listB.cellLines(listB.rolesCell(listB.row(mailOf(moss))))).toEqual(['Copyeditor']);
        expect(await listB.cellLines(listB.rolesCell(listB.row(mailOf(fern))))).toEqual(['Author']);

        // The start date and the masthead choice: moss's roles page lists
        // "Copyeditor" from 2020-01-01; fern's "Author" reads "Does not
        // appear on the masthead" (Rules 24a, 24b, 28).
        const mossRoles = await openRolesPage(listB, mailOf(moss));
        await mossRoles.expectRole('Copyeditor', [{start: '2020-01-01', end: '---'}]);
        const fernRoles = await openRolesPage(listB, mailOf(fern));
        await fernRoles.expectRole('Author', [{masthead: 'Does not appear on the masthead', choice: true}]);

        // moss signs in to B with its password from A (footnote sc; Rule 23).
        const mossB = await signInByForm(browser, baseURL, b, moss);
        await expect(mossB).not.toHaveURL(/\/login/);
        await mossB.context().close();

        // Control: no email to moss or fern (Rule 28).
        await expectNoMailBesidesControl(browser, baseURL, pkpMail, b, manager, [moss, fern]);
    });

    test('S11: role dates in a users file', async ({browser, baseURL, asUser, ompApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s11', testInfo);
        const manager = `${tag}mg`;
        const u = (k) => `${tag}${k}`;
        await ompApi.createContext({tag, context: contact(tag), users: [user(manager, 'Mona', 'Manager', ['manager'])]});
        // The two files (footnote sc: a left-out element is "no date", an
        // empty one "empty").
        const first = testInfo.outputPath('users-role-dates-first.xml');
        fs.writeFileSync(
            first,
            usersXmlFile([
                fileUser(u('ash'), 'Ash', [{name: 'Reader', start: '5.1.2024'}]),
                fileUser(u('birch'), 'Birch', [{name: 'Reader', start: '2024-W01-5'}]),
                fileUser(u('cedar'), 'Cedar', [{name: 'Reader', start: '2024-01-05 09:30'}]),
                fileUser(u('dove'), 'Dove', [{name: 'Reader', start: 'Friday, January 5, 2024'}]),
                fileUser(u('elder'), 'Elder', [{name: 'Reader', start: '', end: ''}]),
            ])
        );
        const second = testInfo.outputPath('users-role-dates-second.xml');
        fs.writeFileSync(
            second,
            usersXmlFile([
                fileUser(u('ivy'), 'Ivy', [{name: 'Copyeditor', start: 'soon'}, 'Reader']),
                fileUser(u('juniper'), 'Juniper', [{name: 'Reader', start: '0000-00-00 00:00:00'}]),
                fileUser(u('kauri'), 'Kauri', [{name: 'Reader', start: '1704447000'}]),
                fileUser(u('larch'), 'Larch', [{name: 'Reader', start: 'Mon, 05 Jan 2024 09:30:00 +0000'}]),
                fileUser(u('maple'), 'Maple', [{name: 'Reader', start: '2027-01-01', end: '2027-01-01 00:00:00'}]),
                fileUser(u('nutmeg'), 'Nutmeg', [{name: 'Reader', start: '2027-01-01', end: '2026-01-01'}]),
                fileUser(u('oak'), 'Oak', ['Reader']),
            ])
        );
        const page = await pageAs(asUser, manager);
        const side = await page.context().newPage();
        const users = new UsersXmlPage(page, tag);

        // The first file: "Results" with the success sentence (Rules 22, 22c).
        await users.goto();
        await users.expectSelected('Import Users');
        await users.upload(first);
        const firstResults = await users.pressImport();
        await expect(firstResults).toHaveText(USERS_IMPORTED_WHOLE);

        // The start dates: ash, birch, cedar and dove "Reader" from
        // 2024-01-05; elder "Reader" from the day of the import (Rules 22c,
        // 24b).
        const list = new UsersListPage(side, tag);
        await list.goto();
        for (const [k, start] of [['ash', '2024-01-05'], ['birch', '2024-01-05'], ['cedar', '2024-01-05'], ['dove', '2024-01-05'], ['elder', today()]]) {
            const row = list.row(mailOf(u(k)));
            await expect(row, k).toHaveCount(1);
            expect(await list.cellLines(list.rolesCell(row)), k).toEqual(['Reader']);
            await expect(list.startDateCell(row), k).toHaveText(whole(start));
        }

        // The second file: a second "Results" tab, "Import/Export errors:"
        // with a line for each refused role and no success sentence (Rules
        // 22, 22c).
        await users.openTab('Import Users');
        await expect(users.changeFileButton()).toBeVisible();
        await users.upload(second);
        const secondResults = await users.pressImport();
        await expect(users.tabsNamed('Results')).toHaveCount(2);
        await expect(secondResults.getByRole('heading', {name: 'Import/Export errors:', exact: true})).toBeVisible();
        await expect(resultLines(secondResults)).toHaveText([
            INVALID_DATE(u('ivy'), 'Copyeditor', 'soon'),
            INVALID_DATE(u('juniper'), 'Reader', '0000-00-00 00:00:00'),
            INVALID_DATE(u('kauri'), 'Reader', '1704447000'),
            INVALID_DATE(u('larch'), 'Reader', 'Mon, 05 Jan 2024 09:30:00 +0000'),
            BAD_PERIOD(u('maple'), 'Reader'),
            BAD_PERIOD(u('nutmeg'), 'Reader'),
        ]);
        await expect(secondResults).not.toContainText('The import completed successfully.');

        // The accounts: ivy with "Reader" alone, oak with "Reader"; none of
        // juniper, kauri, larch, maple and nutmeg, the list's count bounding
        // the read (admin, the manager, the five of the first file, ivy and
        // oak; Rule 22c).
        await list.goto();
        await expect(list.usersHeading(9)).toBeVisible({timeout: T});
        for (const k of ['ivy', 'oak']) {
            const row = list.row(mailOf(u(k)));
            await expect(row, k).toHaveCount(1);
            expect(await list.cellLines(list.rolesCell(row)), k).toEqual(['Reader']);
        }
        for (const k of ['juniper', 'kauri', 'larch', 'maple', 'nutmeg']) {
            await expect(list.row(mailOf(u(k))), k).toHaveCount(0);
        }

        // Control: nutmeg signs in with "rolepass1", though the list does not
        // list it (Rule 22c).
        const nutmegPage = await signInByForm(browser, baseURL, tag, u('nutmeg'), ROLE_PASS);
        await expect(nutmegPage).not.toHaveURL(/\/login/);
        await nutmegPage.context().close();
    });

    test('S12: a users file imported again', async ({browser, baseURL, asUser, ompApi, pkpMail}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s12', testInfo);
        const manager = `${tag}mg`;
        const rook = `${tag}rook`;
        const quill = `${tag}quill`;
        const sage = `${tag}sage`;
        const tern = `${tag}tern`;
        const wake = `${tag}wake`;
        // rook's role begins when the press is created (footnote sc).
        await ompApi.createContext({
            tag,
            context: contact(tag),
            users: [user(manager, 'Mona', 'Manager', ['manager']), user(rook, 'Rook', 'Editor', ['sectionEditor'])],
        });
        const created = today();
        const rookInFile = (roles) => ({givenName: 'Rook', familyName: 'Editor', email: mailOf(rook), username: rook, password: {plain: ROLE_PASS}, roles});
        const first = testInfo.outputPath('users-again-first.xml');
        fs.writeFileSync(
            first,
            usersXmlFile([
                fileUser(quill, 'Quill', [{name: SERIES_EDITOR, start: '2099-06-01'}, {name: 'Reader', start: '2020-01-01', end: '2099-12-31'}]),
                fileUser(sage, 'Sage', [{name: SERIES_EDITOR, end: '2020-12-31'}, 'Reader']),
                fileUser(tern, 'Tern', [{name: REVIEWER, masthead: false}, {name: SERIES_EDITOR, masthead: false}]),
                fileUser(wake, 'Wake', [{name: SERIES_EDITOR, start: '2019-01-01', end: '2020-12-31'}]),
            ])
        );
        const second = testInfo.outputPath('users-again-second.xml');
        fs.writeFileSync(second, usersXmlFile([rookInFile([{name: SERIES_EDITOR, start: '2020-01-01'}, {name: SERIES_EDITOR, start: '2015-01-01', end: '2016-01-01'}])]));
        const third = testInfo.outputPath('users-again-third.xml');
        fs.writeFileSync(third, usersXmlFile([rookInFile([SERIES_EDITOR]), fileUser(quill, 'Quill', [{name: SERIES_EDITOR, start: '2099-06-01 00:00:00'}])]));
        const page = await pageAs(asUser, manager);
        const side = await page.context().newPage();
        const users = new UsersXmlPage(page, tag);
        const list = new UsersListPage(side, tag);
        const about = new AboutPages(side, tag);
        /** A role's periods on a roles page as `start|end`, a set (lesson 14c). */
        const periods = async (roles, role) => (await roles.readRows()).filter((r) => r.role === role).map((r) => `${r.start}|${r.end}`).sort();
        const expectRookHeldOnce = async () => {
            const roles = await openRolesPage(list, mailOf(rook));
            await expect
                .poll(() => periods(roles, SERIES_EDITOR), {timeout: T, message: "rook's Series editor periods"})
                .toEqual([`${created}|---`, '2015-01-01|2016-01-01'].sort());
        };

        // The first file: the success sentence (Rule 22).
        await users.goto();
        await users.upload(first);
        await expect(await users.pressImport()).toHaveText(USERS_IMPORTED_WHOLE);

        // The roles pages: quill "Series editor" from 2099-06-01 and "Reader"
        // from 2020-01-01; sage "Series editor" "---" with 2020-12-31 beside
        // it and "Reader" from the day of the import; tern's reviewer role
        // with no choice offered, its "Series editor" "Does not appear on the
        // masthead" (Rules 24a, 24b). The reviewer row reads "Does not appear
        // on the masthead": this press does not list reviewers on its
        // masthead (a new press's state).
        const quillRoles = await openRolesPage(list, mailOf(quill));
        await quillRoles.expectRole(SERIES_EDITOR, [{start: '2099-06-01'}]);
        await quillRoles.expectRole('Reader', [{start: '2020-01-01'}]);
        const sageRoles = await openRolesPage(list, mailOf(sage));
        await sageRoles.expectRole(SERIES_EDITOR, [{start: '---', end: '2020-12-31'}]);
        await sageRoles.expectRole('Reader', [{start: created}]);
        const ternRoles = await openRolesPage(list, mailOf(tern));
        await ternRoles.expectRole(REVIEWER, [{masthead: 'Does not appear on the masthead', choice: false}]);
        await ternRoles.expectRole(SERIES_EDITOR, [{masthead: 'Does not appear on the masthead', choice: true}]);

        // "Editorial History" lists, under "Series editor", wake with
        // "2019 – 2020" and sage with "– 2020"; "Editorial Masthead" lists
        // rook there and not tern (Rules 24a, 24b).
        await about.goto('history');
        await expect(about.entryParts(about.listEntry(SERIES_EDITOR, fileName('Wake'))).dateStart).toHaveText(whole('2019 – 2020'));
        await expect(about.entryParts(about.listEntry(SERIES_EDITOR, fileName('Sage'))).dateStart).toHaveText(whole('– 2020'));
        await about.goto('masthead');
        await expect(about.listEntry(SERIES_EDITOR, 'Rook Editor')).toHaveCount(1);
        await expect(about.main).not.toContainText(fileName('Tern'));

        // Imported again: Tools › "Users XML Plugin" opened again, the first
        // file uploaded on "Import Users": a new "Results" tab with the
        // success sentence; quill's roles page lists each role once (Rules
        // 8, 24). The page opened afresh is also what lets "Export Users"
        // list the accounts the first import made (OMP7).
        await users.goto();
        await users.expectSelected('Import Users');
        await users.upload(first);
        const again = await users.pressImport();
        await expect(users.tabsNamed('Results')).toHaveCount(1);
        await expect(again).toHaveText(USERS_IMPORTED_WHOLE);
        const quillAgain = await openRolesPage(list, mailOf(quill));
        await quillAgain.expectRole(SERIES_EDITOR, [{start: '2099-06-01'}]);
        await quillAgain.expectRole('Reader', [{start: '2020-01-01'}]);

        // The "Export Users" list: quill, sage and tern, not wake, whose only
        // role has ended (Rule 26).
        await users.openExportTab();
        for (const who of [quill, sage, tern]) await expect(users.row(mailOf(who)), who).toHaveCount(1);
        await expect(users.row(mailOf(wake))).toHaveCount(0);

        // "Export All Users", "OK": the file holds quill and no wake (Rule 27).
        await users.exportAllLink().click();
        await expect(users.confirmWindow()).toHaveCount(1, {timeout: T});
        const all = await downloadFrom(page, () => users.confirmWindow().getByRole('button', {name: 'OK', exact: true}).click());
        const allNames = usersInFile(all.text).map((x) => x.username);
        expect(allNames).toContain(quill);
        expect(allNames).not.toContain(wake);

        // A27 🐞 (not asserted, M3): "Confirm" may stay open after "OK"; its "Cancel" closes it.
        if (await users.confirmWindow().isVisible()) {
            await users.confirmWindow().getByRole('button', {name: 'Cancel', exact: true}).click();
        }
        await expect(users.confirmWindow()).toBeHidden({timeout: T});

        // sage's file: sage alone, its "Series editor" role with its end date
        // alone (Rules 24b, 27); imported back, no line naming a role of
        // sage's (A16: on a PHP older than 8.4 the new-password line), and
        // the role still held once, "---" under "Start Date" (Rules 24, 24b).
        await users.rowBox(mailOf(sage)).check();
        const sageFile = await downloadFrom(page, () => users.exportUsersButton().click());
        const inSageFile = usersInFile(sageFile.text);
        expect(inSageFile.map((x) => x.username)).toEqual([sage]);
        const sageSeries = inSageFile[0].groups.filter((g) => g.name === SERIES_EDITOR);
        expect(sageSeries).toHaveLength(1);
        expect(sageSeries[0].start, 'no start date in the file').toBeNull();
        expect(sageSeries[0].end).toMatch(/^2020-12-31/);
        const sageBack = testInfo.outputPath('users-sage-back.xml');
        fs.writeFileSync(sageBack, sageFile.text);
        await users.openTab('Import Users');
        await users.upload(sageBack);
        const sageResults = await users.pressImport();
        await expect(users.tabsNamed('Results')).toHaveCount(2);
        await expectEveryUserImported(sageResults, {usernames: [sage], successText: USERS_IMPORTED, newPasswordLine: NEW_PASSWORD_SENT});
        await expect(resultLines(sageResults).filter({hasText: `of the user "${sage}"`})).toHaveCount(0);
        const sageAgain = await openRolesPage(list, mailOf(sage));
        await sageAgain.expectRole(SERIES_EDITOR, [{start: '---', end: '2020-12-31'}]);

        // An overlapping period: the overlap line once and no success
        // sentence; "Editorial History" lists rook with "2015 – 2016"; rook's
        // current role still held once, from the day the press was created
        // (Rule 24).
        await users.openTab('Import Users');
        await users.upload(second);
        const overlap = await users.pressImport();
        await expect(users.tabsNamed('Results')).toHaveCount(3);
        await expect(overlap.getByRole('heading', {name: 'Import/Export errors:', exact: true})).toBeVisible();
        await expect(resultLines(overlap)).toHaveText([ROLE_HELD(rook, SERIES_EDITOR)]);
        await expect(overlap).not.toContainText('The import completed successfully.');
        await about.goto('history');
        await expect(about.entryParts(about.listEntry(SERIES_EDITOR, 'Rook Editor')).dateStart).toHaveText(whole('2015 – 2016'));
        await expectRookHeldOnce();

        // No dates, and a start written with a time: the success sentence;
        // rook's current role still once, quill's "Series editor" once from
        // 2099-06-01 (Rules 22c, 24).
        await users.openTab('Import Users');
        await users.upload(third);
        const third_ = await users.pressImport();
        await expect(users.tabsNamed('Results')).toHaveCount(4);
        await expect(third_).toHaveText(USERS_IMPORTED_WHOLE);
        await expectRookHeldOnce();
        const quillLast = await openRolesPage(list, mailOf(quill));
        await quillLast.expectRole(SERIES_EDITOR, [{start: '2099-06-01'}]);

        // Control: no email to quill, sage, tern, wake or rook from the
        // imports (Side effects bullet 2).
        await expectNoMailBesidesControl(browser, baseURL, pkpMail, tag, manager, [quill, sage, tern, wake, rook]);
    });
});
