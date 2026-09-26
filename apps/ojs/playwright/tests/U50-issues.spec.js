// @ts-check
/**
 * @file playwright/tests/U50-issues.spec.js
 *
 * Issues — OJS suite, the parallel part: one test per canonical scenario
 * the journal runs outside the serial project (S2–S8, S10). S1 and S9 read
 * the issue email after the site's background jobs run, so they live in
 * ./serial/U50-issues.spec.js. S11 is the press's and the preprint
 * server's absence, in the OMP and OPS trees; its journal-side control
 * (the Journal Manager's "Content" › "Issues", the visitor's "Current" and
 * `issue/current` opening "Vol. 1 No. 2 (2014)") rides in S7 here.
 * Spec: docs/specs/U50-issues.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A1 🐞: the "Title" box's arrival state is never read (S1 unticks the
 *   boxes; S8 unticks "Title"); the notice of the refused title is not
 *   driven.
 * - A4 🐞: the date "Date Published" shows after a refused "Save" is never
 *   read; S1 and S2 replace or empty it.
 * - A12 🐞: S6 reads the deleted issue's article page offline, never its
 *   workflow header.
 * - A3 ❓: S6 reads the "Delete" question's text, never that it says
 *   nothing about the articles.
 * - A15 ❓: S9 presses "OK" in "Publish Issue" without reading the box's
 *   arrival state.
 * - A2, A5, A6, A7, A8, A9, A10, A11, A13, A14: not on these scenarios'
 *   paths.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only. S7 runs on publicknowledge with `manager.maya`,
 * `sectioneditor.ana`, `copyeditor.carla`, `author.alex` and `reader.rosa`
 * and only reads its seeded issues; every other test seeds its own scratch
 * journal with throwaway accounts (the username twice as password), as
 * footnote s0 says: `issues[]` with `published`, `datePublished` and
 * `galleys[]`, `sections[]` with `hideTitle` (S3), `publishingMode` (S8),
 * `restrictArticleAccess` and `plugins` (S10), and scratch submissions
 * `published` into an `issue` (scheduled when the issue is unpublished).
 *
 * Every absence is read settled and paired with a positive control taken
 * the same way (M4, M6); S3's mailbox silence is bounded by a "Notify" the
 * test sends to a spare account of its own journal (A8). Browser dialogs
 * are recorded and answered on every manager page ("The data on this form
 * has changed…"). The visitor is a browser context with no session
 * (patterns.md lesson 8). Waits are web-first or bounded by the screen's
 * own answer (A5).
 */
const path = require('path');
const {test, expect} = require('../support/fixtures.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {ActivityLogWindow} = require('../../../../shared/playwright/pages/ActivityLogPages.js');
const {recordBrowserDialogs, captureDownload} = require('../../../../shared/playwright/pages/SubmissionFilesPages.js');
const {
    ArticleLandingPage,
    GalleyReaderPage,
    LANDING_TEXT,
    expectLoginPage,
    expectNotFoundPage,
} = require('../../../../shared/playwright/pages/ArticleLandingPages.js');
const {
    ISSUES_TEXT: TEXT,
    ISSUES_REQUEST: REQUEST,
    IssuesAdmin,
    IssueReader,
    notice,
} = require('../../../../shared/playwright/pages/IssuesPages.js');
const {PublicationScreen} = require('../pages/PublicationMetadataPages.js');
const {PublishScreen} = require('../pages/PublishSchedulePages.js');

const FILES = path.join(__dirname, '..', 'fixtures', 'files');
const file = (name) => path.join(FILES, name);
const NOTIFY_SUBJECT = 'Discussion (Submission)';
const PK = 'publicknowledge';
const PK_PUBLISHED = 'Vol. 1 No. 2 (2014)';
const PK_FUTURE = 'Vol. 2 No. 1 (2015)';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u50${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: mailOf(username), roles};
}

/** A scratch journal's name as the scenario API gives it. */
const journalName = (tag) => `Scratch context ${tag}`;

/** An issue key for `issues[]` and a submission's `issue`. */
const issue = (volume, number, year, extra = {}) => ({volume, number, year, ...extra});

/**
 * Seed a scratch journal with a throwaway Journal Manager and `extra`
 * accounts; returns the manager and the context's answer.
 */
async function seedJournal(ojsApi, tag, {extra = [], ...keys} = {}) {
    const users = [user(`${tag}mg`, 'Mona', 'Manager', ['manager']), ...extra];
    const context = await ojsApi.createContext({tag, users, ...keys});
    return {manager: `${tag}mg`, context};
}

/** A published (or, into a future issue, scheduled) scratch article. */
function article(ojsApi, tag, key, submitter, title, issueKey, extra = {}) {
    return ojsApi.createSubmission({
        tag: `${tag}${key}`,
        context: tag,
        submitter,
        title,
        published: true,
        issue: {volume: issueKey.volume, number: issueKey.number, year: issueKey.year},
        ...extra,
    });
}

/** The manager's page on the Issues page of `contextPath`, dialogs recorded. */
async function managerPage(asUser, username, contextPath) {
    const page = await (await asUser(username)).newPage();
    return {page, issues: new IssuesAdmin(page, contextPath), dialogs: recordBrowserDialogs(page)};
}

/** A signed-out visitor (an explicit empty state, patterns.md lesson 8). */
async function visitorPage(browser, baseURL, contextPath) {
    const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
    const page = await context.newPage();
    return {page, reader: new IssueReader(page, contextPath)};
}

/** Group a table-of-contents outline (`# Section`, titles) into sections, titles sorted. */
function bySection(outline) {
    /** @type {Record<string, string[]>} */
    const out = {};
    let current = '';
    for (const line of outline) {
        if (line.startsWith('# ')) {
            current = line.slice(2);
            out[current] = out[current] || [];
        } else {
            (out[current] = out[current] || []).push(line);
        }
    }
    for (const key of Object.keys(out)) out[key].sort();
    return out;
}

test.describe('issues', () => {
    test('S2: an issue\'s data: its name, description, cover, URL Path and date', async ({asUser, browser, baseURL, ojsApi}, testInfo) => {
        test.setTimeout(360_000);
        const tag = makeTag('s2', testInfo);
        const {manager, context} = await seedJournal(ojsApi, tag, {
            issues: [issue(1, 1, 2025, {published: true, datePublished: '2025-03-01'}), issue(1, 2, 2026)],
        });
        const issueId = context.issues[0].id;
        const {page, issues, dialogs} = await managerPage(asUser, manager, tag);
        const {page: visitor, reader} = await visitorPage(browser, baseURL, tag);

        // The window: titled with the name, open on "Table of Contents",
        // three tabs and no "Access" or "Identifiers" (Rule 5).
        let name = 'Vol. 1 No. 1 (2025)';
        await issues.goto('Back Issues');
        let win = await issues.openManagement('Back Issues', name);
        await expect(win.dialog.getByRole('heading', {level: 1})).toHaveText(`Issue Management: ${name}`);
        await expect(win.selectedTab()).toHaveText('Table of Contents');
        await expect(win.dialog.getByRole('tab')).toHaveText(['Table of Contents', 'Issue Data', 'Issue Galleys']);

        // A title: "Your changes have been saved." and the row's new name
        // (Rules 2, 6).
        let form = await win.openData();
        await form.showBox('Title').check();
        await form.titleBox().fill('Special Issue');
        await form.save();
        await expect(notice(page, TEXT.saved).first()).toBeVisible();
        name = 'Vol. 1 No. 1 (2025): Special Issue';
        await expect(issues.names('Back Issues')).toHaveText([name]);

        // Fewer parts: "Number" unticked (Rule 2).
        win = await issues.openManagement('Back Issues', name);
        form = await win.openData();
        await form.showBox('Number').uncheck();
        await form.save();
        await expect(notice(page, TEXT.saved).first()).toBeVisible();
        name = 'Vol. 1 (2025): Special Issue';
        await expect(issues.names('Back Issues')).toHaveText([name]);

        // Leaving with an unsaved change: a tab and the window's "Close"
        // ask; "Cancel" there keeps the window; the form's "Cancel" closes
        // it without asking, and nothing typed is kept (Fields). Text typed
        // in "Description" alone raises no question (T-ojs-1,
        // `.reports/U50/test-ojs-findings.md`), so the change the question
        // is read on is a typed "URL Path" beside the description.
        win = await issues.openManagement('Back Issues', name);
        form = await win.openData();
        await form.typeDescription('An issue about tides.');
        await form.urlPathBox().fill('tides');
        const asked = dialogs.messages.length;
        dialogs.answerNext('dismiss');
        await win.tab('Table of Contents').click();
        await expect.poll(() => dialogs.messages.slice(asked)).toEqual([TEXT.formChanged]);
        await expect(win.selectedTab()).toHaveText('Issue Data');
        expect(await form.descriptionText()).toBe('An issue about tides.');
        await expect(form.urlPathBox()).toHaveValue('tides');
        dialogs.answerNext('dismiss');
        await win.dialog.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect.poll(() => dialogs.messages.slice(asked)).toEqual([TEXT.formChanged, TEXT.formChanged]);
        await expect(form.saveButton()).toBeVisible();
        await form.cancelLink().click();
        await expect(win.dialog).toHaveCount(0);
        expect(dialogs.messages.slice(asked)).toHaveLength(2);
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
        win = await issues.openManagement('Back Issues', name);
        form = await win.openData();
        expect(await form.descriptionText()).toBe('');
        await expect(form.urlPathBox()).toHaveValue('');

        // A description and a cover; reopened, the image with "Alternate
        // text" and "Delete" (Rules 6, 7; Fields).
        await form.typeDescription('An issue about tides.');
        const uploaded = await form.uploadCover(file('profile-image-400.png'));
        expect(uploaded.ok()).toBe(true);
        await form.save();
        await expect(notice(page, TEXT.saved).first()).toBeVisible();
        win = await issues.openManagement('Back Issues', name);
        form = await win.openData();
        await expect(form.coverImage()).toBeVisible();
        await expect(form.altTextBox()).toBeVisible();
        await expect(form.coverDeleteLink()).toBeVisible();
        await form.altTextBox().fill('A tide chart');
        await form.save();
        await expect(notice(page, TEXT.saved).first()).toBeVisible();

        // The reader side: the page and the archive's summary (Rule 2;
        // Fields).
        await reader.gotoHome();
        await reader.pressHeader('Current');
        await expect(reader.heading()).toHaveText(name);
        await expect(reader.coverImage()).toHaveAttribute('alt', /^\s*A tide chart\s*$/);
        await expect(reader.description()).toHaveText('An issue about tides.');
        await expect(reader.publishedLine()).toHaveText(/^\s*Published:\s*2025-03-01\s*$/);
        await reader.pressHeader('Archives');
        const summary = reader.summary('Special Issue');
        await expect(summary).toHaveCount(1);
        await expect(summary.locator('a.cover')).toBeVisible();
        await expect(summary.locator('a.title')).toHaveText('Special Issue');
        await expect(summary.locator('.series')).toHaveText('Vol. 1 (2025)');
        await expect(summary.locator('.description')).toHaveText('An issue about tides.');

        // A URL Path: digits refused; a word opens the page, and so does
        // the address "View" opens, which carries the ID (Rules 8, 21).
        win = await issues.openManagement('Back Issues', name);
        form = await win.openData();
        await form.urlPathBox().fill('123');
        await form.saveRefused(TEXT.urlPathNumber);
        await form.urlPathBox().fill('spring-2025');
        await form.save();
        await expect(notice(page, TEXT.saved).first()).toBeVisible();
        await visitor.goto(reader.issueUrl('spring-2025'));
        await expect(reader.heading()).toHaveText(name);
        const view = await issues.openInNewTab('Back Issues', name, 'View');
        expect(view.url()).toMatch(new RegExp(`/issue/view/${issueId}$`));
        await view.close();
        await visitor.goto(reader.issueUrl(issueId));
        await expect(reader.heading()).toHaveText(name);

        // "Date Published" emptied: refused under the box and in the
        // notice; a new date shows in "Published" and on the page (Rules
        // 4, 6).
        await issues.goto('Back Issues');
        win = await issues.openManagement('Back Issues', name);
        form = await win.openData();
        await form.typeDate('');
        await form.saveRefused(TEXT.dateRequired);
        await expect(form.fieldError(TEXT.dateRequired)).toBeVisible();
        await form.typeDate('2025-04-01');
        await form.save();
        await expect(notice(page, TEXT.saved).first()).toBeVisible();
        await expect(issues.published(name)).toHaveText('2025-04-01');
        await visitor.goto(reader.issueUrl(issueId));
        await expect(reader.publishedLine()).toHaveText(/^\s*Published:\s*2025-04-01\s*$/);

        // The cover deleted: the question, then no image and no alternate
        // text; the page shows no cover (Rule 7).
        win = await issues.openManagement('Back Issues', name);
        form = await win.openData();
        await form.coverDeleteLink().click();
        const question = page.getByRole('dialog').filter({hasText: TEXT.confirmDelete}).last();
        await expect(question).toBeVisible();
        await issues.answer(question, 'OK', REQUEST.deleteCover);
        // The form keeps a stale, hidden image element: read what shows.
        await expect(form.coverImage().filter({visible: true})).toHaveCount(0);
        await expect(form.altTextBox().filter({visible: true})).toHaveCount(0);
        await expect(form.urlPathBox()).toHaveValue('spring-2025');
        await visitor.reload();
        await expect(reader.publishedLine()).toBeVisible();
        await expect(reader.coverImage()).toHaveCount(0);
        await form.cancelLink().click();
        await expect(win.dialog).toHaveCount(0);
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));

        // The other issue: a used path, a space, an SVG cover (Rules 7, 8).
        const other = 'Vol. 1 No. 2 (2026)';
        await issues.showTab('Future Issues');
        win = await issues.openManagement('Future Issues', other);
        form = await win.openData();
        await form.urlPathBox().fill('spring-2025');
        await form.saveRefused(TEXT.urlPathUsed);
        await form.urlPathBox().fill('a b');
        await form.saveRefused(TEXT.urlPathChars);
        await form.urlPathBox().fill('');
        const svg = await form.uploadCover(file('cover.svg'));
        expect(svg.ok()).toBe(true);
        await form.saveRefused(TEXT.coverFormat);
        await form.cancelLink().click();
        await expect(win.dialog).toHaveCount(0);
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));

        // Control: an empty date and a fresh path are saved (Rules 6, 8).
        win = await issues.openManagement('Future Issues', other);
        form = await win.openData();
        await expect(form.dateBox()).toHaveValue('');
        await form.urlPathBox().fill('autumn-2026');
        await form.save();
        await expect(notice(page, TEXT.saved).first()).toBeVisible();
    });

    test('S3: the table of contents: its order and a removed article', async ({asUser, browser, baseURL, ojsApi, pkpMail}, testInfo) => {
        test.setTimeout(360_000);
        const tag = makeTag('s3', testInfo);
        const author = `${tag}au`;
        const spare = `${tag}x`;
        const current = issue(1, 1, 2026);
        const future = issue(1, 2, 2026);
        const {manager} = await seedJournal(ojsApi, tag, {
            extra: [user(author, 'Ada', 'Author', ['author']), user(spare, 'Xena', 'Spare', ['author'])],
            sections: [
                {abbrev: 'ART', title: 'Articles'},
                {abbrev: 'REV', title: 'Reviews', hideTitle: true},
            ],
            issues: [{...current, published: true}, future],
        });
        // The three published articles in the order named (footnote s0).
        await article(ojsApi, tag, 'a', author, 'Tidal Patterns', current, {section: 'ART'});
        await article(ojsApi, tag, 'b', author, 'Coastal Winds', current, {section: 'ART'});
        const review = await article(ojsApi, tag, 'c', author, 'A Review of Tides', current, {section: 'REV'});
        const [, control] = await Promise.all([
            article(ojsApi, tag, 'd', author, 'Storm Surges', future, {section: 'ART'}),
            ojsApi.createSubmission({tag: `${tag}e`, context: tag, submitter: spare}),
        ]);
        const {page, issues} = await managerPage(asUser, manager, tag);
        const {page: visitor, reader} = await visitorPage(browser, baseURL, tag);
        const name = 'Vol. 1 No. 1 (2026)';

        // What the tab lists: "Items" 3, the articles under their sections,
        // "Order", and no "Open Access" column (Rule 9; Settings 1, 4).
        await issues.goto('Back Issues');
        await expect(issues.items('Back Issues', name)).toHaveText('3');
        let win = await issues.openManagement('Back Issues', name);
        await expect.poll(async () => bySection(await win.tocOutline())).toEqual({
            Articles: ['Coastal Winds', 'Tidal Patterns'],
            Reviews: ['A Review of Tides'],
        });
        await expect(win.tocOrdering().orderLink()).toBeVisible();
        await expect(win.tocColumns()).toHaveText(['Title']);
        await win.close();

        // The scheduled issue lists "Storm Surges" (Rule 9).
        await issues.showTab('Future Issues');
        win = await issues.openManagement('Future Issues', 'Vol. 1 No. 2 (2026)');
        await expect.poll(() => win.tocOutline()).toEqual(['# Articles', 'Storm Surges']);
        await win.close();

        // The reader side: "Articles" with its two, "A Review of Tides"
        // with no heading (Rule 23; Settings 4).
        await reader.gotoHome();
        await reader.pressHeader('Current');
        let pageOutline = await reader.tocOutline();
        expect(pageOutline).toHaveLength(4);
        expect(pageOutline[0]).toBe('# Articles');
        expect(pageOutline.slice(1, 3).sort()).toEqual(['Coastal Winds', 'Tidal Patterns']);
        expect(pageOutline[3]).toBe('A Review of Tides');
        const issueUrl = visitor.url();
        await reader.articleLink('A Review of Tides').click();
        await expect(new ArticleLandingPage(visitor, tag).title()).toHaveText('A Review of Tides');
        const reviewUrl = visitor.url();
        await visitor.goto(issueUrl);

        // "Order", then "Done": the lower "Articles" row dragged up (Rule 10).
        await issues.showTab('Back Issues');
        win = await issues.openManagement('Back Issues', name);
        // Read once both rows are in (the window's list loads after it opens).
        let before = [];
        await expect
            .poll(async () => (before = (await win.tocOutline()).filter((l) => l === 'Tidal Patterns' || l === 'Coastal Winds')).length, {timeout: 30_000})
            .toBe(2);
        const [upper, lower] = before;
        const ordering = win.tocOrdering();
        await ordering.start();
        await win.dragArticle(lower, upper, 'above');
        const done = await ordering.done();
        expect(done.ok()).toBe(true);
        await expect.poll(() => win.tocOutline()).toEqual(['# Articles', lower, upper, '# Reviews', 'A Review of Tides']);
        await visitor.reload();
        await expect.poll(() => reader.tocOutline()).toEqual(['# Articles', lower, upper, 'A Review of Tides']);

        // "Order", then "Cancel ordering": the order "Done" saved (Rule 10).
        await ordering.start();
        await win.dragArticle(lower, upper, 'below');
        await ordering.cancel();
        await expect.poll(() => win.tocOutline()).toEqual(['# Articles', lower, upper, '# Reviews', 'A Review of Tides']);

        // "Submission": the article's workflow (Rule 11).
        const frame = new WorkflowPage(page, tag);
        await (await win.articleLink('A Review of Tides', 'Submission')).click();
        await frame.expectOpen(review.submissionId);
        const workflowUrl = page.url();
        expect(workflowUrl).toContain(`workflowSubmissionId=${review.submissionId}`);

        // "Remove": the question, then the article and its section's
        // heading leave the tab (Rule 12).
        await issues.goto('Back Issues');
        win = await issues.openManagement('Back Issues', name);
        const remove = await win.openRemove('A Review of Tides');
        await expect(remove.getByRole('heading')).toHaveText(TEXT.removeTitle);
        await expect(remove).toContainText(TEXT.removeQuestion);
        const removed = await issues.answer(remove, 'OK', REQUEST.removeArticle);
        expect(removed && removed.ok()).toBe(true);
        await expect.poll(() => win.tocOutline()).toEqual(['# Articles', lower, upper]);

        // After the removal: gone from the page, its page offline; the
        // workflow reads "Unscheduled" and "Schedule For Publication" opens
        // on the same issue; the History line (Rules 12, 23; Side effects).
        await visitor.goto(issueUrl);
        await expect.poll(() => reader.tocOutline()).toEqual(['# Articles', lower, upper]);
        await expectNotFoundPage(visitor, reviewUrl);
        await page.goto(workflowUrl);
        await frame.expectOpen(review.submissionId);
        await frame.gotoEditorial(review.submissionId, {menuKey: `publication_${review.publicationId}_titleAbstract`});
        await frame.expectPublicationStatus('Unscheduled');
        const publish = new PublishScreen(page, tag);
        const panel = await publish.openPublishPanelExpectingIssueFields();
        await publish.awaitAssignmentPreselected(panel);
        await expect(panel.getByRole('radio', {name: 'Assign To Current/Back Issue'})).toBeChecked();
        await expect(panel.locator('select[name="issueId"] option:checked')).toHaveText(name);
        await publish.cancelPanel(panel);
        const log = new ActivityLogWindow(page, frame);
        await log.open();
        expect((await log.historyLines()).map((l) => l.event)).toContain('The submission was unpublished.');
        await log.close();

        // Control: the page keeps the saved order; no email about the
        // removal, bounded by a "Notify" to the spare (Side effects; A8).
        await visitor.goto(issueUrl);
        await expect.poll(() => reader.tocOutline()).toEqual(['# Articles', lower, upper]);
        const notify = new PublicationScreen(page, tag);
        await notify.gotoWorkflow(control.submissionId);
        await notify.openStage('Submission');
        await notify.notifyParticipant('Xena Spare', `<p>Control ${tag}</p>`);
        const afterControl = {to: mailOf(spare), subject: NOTIFY_SUBJECT, contains: `Control ${tag}`};
        await pkpMail.expectNone({to: mailOf(author), afterControl});
        await pkpMail.expectNone({to: mailOf(manager), afterControl});
    });

    test('S4: issue galleys and the "Full Issue"', async ({asUser, browser, baseURL, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        const {manager} = await seedJournal(ojsApi, tag, {issues: [issue(1, 1, 2026, {published: true})]});
        const {issues} = await managerPage(asUser, manager, tag);
        const {page: visitor, reader} = await visitorPage(browser, baseURL, tag);
        const name = 'Vol. 1 No. 1 (2026)';

        // The empty tab: "No Items", "Create Issue Galley", no "Order" (Fields).
        await issues.goto('Back Issues');
        const win = await issues.openManagement('Back Issues', name);
        await win.openTab('Issue Galleys');
        await expect(win.galleyNoItems()).toBeVisible();
        await expect(win.createGalleyLink()).toBeVisible();
        await expect(win.galleyOrdering().orderLink()).toBeHidden();

        // No file: the notice (Rule 14a).
        let galley = await win.openCreateGalley();
        await galley.labelBox().fill('PDF');
        await galley.saveRefusedByServer(TEXT.fileRequired);

        // No label: under the box (Rule 14a).
        await galley.upload(file('article.pdf'));
        await galley.labelBox().fill('');
        await galley.saveButton().click();
        await expect(galley.fieldError(TEXT.fieldRequired)).toBeVisible();

        // Saved (Rule 14).
        await galley.labelBox().fill('PDF');
        await galley.save();
        await expect(win.galleyLabels()).toHaveText(['PDF']);

        // A second galley joins the end, and "Order" shows (Rule 14; Fields).
        galley = await win.openCreateGalley();
        await galley.upload(file('notes.md'));
        await galley.labelBox().fill('Notes');
        await galley.save();
        await expect(win.galleyLabels()).toHaveText(['PDF', 'Notes']);
        await expect(win.galleyOrdering().orderLink()).toBeVisible();

        // The reader side: "Full Issue" with both; "PDF" opens the PDF
        // reader, its arrow returns; "Notes" downloads (Actors row 4; Rule
        // 26; Fields).
        await reader.gotoHome();
        await reader.pressHeader('Current');
        const issueUrl = visitor.url();
        await expect(reader.fullIssueHeading()).toHaveText(TEXT.fullIssue);
        await expect(reader.galleyLinks()).toHaveText(['PDF', 'Notes']);
        await reader.galleyLink('PDF').click();
        const pdf = new GalleyReaderPage(visitor);
        await pdf.expectLoaded();
        await expect(pdf.returnLinkName()).toHaveText(LANDING_TEXT.returnToIssue);
        await expect(pdf.titleLink()).toHaveText(name);
        await expect(pdf.downloadLink()).toContainText('Download');
        await expect(visitor).toHaveTitle(`View of ${name}`);
        await pdf.returnLink().click();
        await expect(reader.heading()).toHaveText(name);
        const {download} = await captureDownload(visitor, () => reader.galleyLink('Notes').click());
        expect(download.suggestedFilename()).toMatch(/\.md$/);
        await expect(reader.heading()).toHaveText(name);

        // "Order": "Notes" dragged above "PDF" (Rule 15).
        const ordering = win.galleyOrdering();
        await ordering.start();
        await win.dragGalleyAbove('Notes', 'PDF');
        await ordering.done();
        await expect(win.galleyLabels()).toHaveText(['Notes', 'PDF']);
        await visitor.goto(issueUrl);
        await expect(reader.galleyLinks()).toHaveText(['Notes', 'PDF']);

        // A file replaced (Rule 15; Fields).
        galley = await win.openEditGalley('PDF');
        await expect(galley.labelBox()).toHaveValue('PDF');
        await expect(galley.fileLink('article.pdf')).toBeVisible();
        await galley.upload(file('replacement.pdf'));
        await galley.save();
        galley = await win.openEditGalley('PDF');
        await expect(galley.fileLink('replacement.pdf')).toBeVisible();
        await expect(galley.fileLink('article.pdf')).toHaveCount(0);
        await galley.cancel();

        // A galley deleted (Rule 15).
        const question = await win.openDeleteGalley('Notes');
        await expect(question).toContainText(TEXT.confirmDelete);
        await issues.answer(question, 'OK', REQUEST.galleyDelete);
        await expect(win.galleyLabels()).toHaveText(['PDF']);
        await visitor.goto(issueUrl);
        await expect(reader.galleyLinks()).toHaveText(['PDF']);

        // Control: "PDF" still opens the PDF reader (Rule 26).
        await reader.galleyLink('PDF').click();
        await pdf.expectLoaded();
        await expect(pdf.titleLink()).toHaveText(name);
    });

    test('S5: the current issue and the order of "Back Issues"', async ({asUser, browser, baseURL, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s5', testInfo);
        const v1 = 'Vol. 1 No. 1 (2024)';
        const v2 = 'Vol. 2 No. 1 (2025)';
        const v3 = 'Vol. 3 No. 1 (2026)';
        const v4 = 'Vol. 4 No. 1 (2027)';
        const {manager} = await seedJournal(ojsApi, tag, {
            issues: [
                issue(1, 1, 2024, {published: true, datePublished: '2024-03-01'}),
                issue(3, 1, 2026, {published: true, datePublished: '2026-03-01'}),
                issue(2, 1, 2025, {published: true, datePublished: '2025-03-01'}),
                issue(4, 1, 2027),
            ],
        });
        const {page, issues} = await managerPage(asUser, manager, tag);
        const {reader} = await visitorPage(browser, baseURL, tag);

        // Before any order: the current issue first, then newest first,
        // with "Order"; "Current" opens the current issue (Rules 20, 24).
        await issues.goto('Back Issues');
        await expect(issues.names('Back Issues')).toHaveText([v2, v3, v1]);
        await expect(issues.backOrdering().orderLink()).toBeVisible();
        await reader.gotoHome();
        await reader.pressHeader('Current');
        await expect(reader.heading()).toHaveText(v2);

        // "Current Issue": not on the current issue's row; on another's,
        // the question, then it is current (Rules 17, 20).
        let actions = await issues.rowActionNames('Back Issues', v2);
        expect(actions).toContain('Unpublish Issue');
        expect(actions).not.toContain('Current Issue');
        const question = await issues.openQuestion('Back Issues', v3, 'Current Issue', TEXT.currentQuestion);
        await issues.answer(question, 'OK', REQUEST.current);
        await reader.pressHeader('Current');
        await expect(reader.heading()).toHaveText(v3);
        await issues.goto('Back Issues');
        await expect(issues.names('Back Issues')).toHaveText([v3, v2, v1]);

        // "Order", then "Done": the archive follows (Rules 20, 25a).
        const ordering = issues.backOrdering();
        await ordering.start();
        await issues.dragBackIssueAbove(v1, v3);
        await ordering.done();
        await expect(issues.names('Back Issues')).toHaveText([v1, v3, v2]);
        await reader.pressHeader('Archives');
        await expect(reader.summaryTitles()).toHaveText([v1, v3, v2]);

        // "Order", then "Cancel ordering": as "Done" left it (Rule 20).
        await ordering.start();
        await issues.dragBackIssueAbove(v2, v1);
        await ordering.cancel();
        await expect(issues.names('Back Issues')).toHaveText([v1, v3, v2]);

        // Published later: no warning though empty; current, and last in
        // both lists (Rules 16, 17, 20).
        await issues.showTab('Future Issues');
        const publish = await issues.openPublish(v4);
        await publish.mailBox().uncheck();
        await publish.ok();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(issues.names('Future Issues')).toHaveCount(0);
        await expect(issues.noItems('Future Issues')).toBeVisible();
        await reader.pressHeader('Current');
        await expect(reader.heading()).toHaveText(v4);
        await issues.goto('Back Issues');
        await expect(issues.names('Back Issues')).toHaveText([v1, v3, v2, v4]);
        await reader.pressHeader('Archives');
        await expect(reader.summaryTitles()).toHaveText([v1, v3, v2, v4]);

        // Control: the new current issue offers no "Current Issue"; the old
        // one offers it again (Rule 17).
        actions = await issues.rowActionNames('Back Issues', v4);
        expect(actions).toContain('Unpublish Issue');
        expect(actions).not.toContain('Current Issue');
        actions = await issues.rowActionNames('Back Issues', v3);
        expect(actions).toContain('Current Issue');
    });

    test('S6: "Unpublish Issue" and "Delete"', async ({asUser, browser, baseURL, ojsApi}, testInfo) => {
        test.setTimeout(360_000);
        const tag = makeTag('s6', testInfo);
        const author = `${tag}au`;
        const older = issue(1, 1, 2025);
        const newer = issue(1, 2, 2026);
        const v2025 = 'Vol. 1 No. 1 (2025)';
        const v2026 = 'Vol. 1 No. 2 (2026)';
        const {manager, context} = await seedJournal(ojsApi, tag, {
            extra: [user(author, 'Ada', 'Author', ['author'])],
            issues: [
                {...older, published: true, datePublished: '2025-03-01'},
                {...newer, published: true, datePublished: '2026-03-01'},
            ],
        });
        const olderId = context.issues[0].id;
        await Promise.all([
            article(ojsApi, tag, 'a', author, 'Tidal Patterns', older),
            article(ojsApi, tag, 'b', author, 'Coastal Winds', newer),
        ]);
        const {page, issues} = await managerPage(asUser, manager, tag);
        const {page: visitor, reader} = await visitorPage(browser, baseURL, tag);
        const tidalOnOlder = async () => {
            await visitor.goto(reader.issueUrl(olderId));
            await expect(reader.heading()).toHaveText(v2025);
            await expect(reader.articleLink('Tidal Patterns')).toHaveCount(1);
        };

        // The pages before: "Coastal Winds" from the current issue.
        await tidalOnOlder();
        await reader.pressHeader('Current');
        await expect(reader.heading()).toHaveText(v2026);
        await reader.articleLink('Coastal Winds').click();
        const landing = new ArticleLandingPage(visitor, tag);
        await expect(landing.title()).toHaveText('Coastal Winds');
        const coastalUrl = visitor.url();

        // "Unpublish Issue": the question; back in "Future Issues" with its
        // date kept (Rule 18).
        await issues.goto('Back Issues');
        const unpublish = await issues.openQuestion('Back Issues', v2026, 'Unpublish Issue', TEXT.unpublishQuestion);
        await issues.answer(unpublish, 'OK', REQUEST.unpublish);
        await expect(issues.names('Back Issues')).toHaveText([v2025]);
        await issues.showTab('Future Issues');
        await expect(issues.names('Future Issues')).toHaveText([v2026]);
        let win = await issues.openManagement('Future Issues', v2026);
        const form = await win.openData();
        await expect(form.dateBox()).toHaveValue('2026-03-01');

        // The reader side: the article answers 404, no current issue, the
        // archive lists the other alone (Rules 18, 24, 25).
        await expectNotFoundPage(visitor, coastalUrl);
        await reader.gotoHome();
        await reader.pressHeader('Current');
        await expect(reader.heading()).toHaveText(TEXT.noCurrentIssue);
        await reader.pressHeader('Archives');
        await expect(reader.summaryTitles()).toHaveText([v2025]);
        await tidalOnOlder();

        // The History: "The submission was unpublished." (Side effects).
        await win.openTab('Table of Contents');
        const frame = new WorkflowPage(page, tag);
        await (await win.articleLink('Coastal Winds', 'Submission')).click();
        await frame.expectOpen();
        const log = new ActivityLogWindow(page, frame);
        await log.open();
        expect((await log.historyLines()).map((l) => l.event)).toContain('The submission was unpublished.');
        await log.close();

        // Published again: the article opens, "Current" opens the issue
        // (Rules 17, 18).
        await issues.goto('Future Issues');
        const publish = await issues.openPublish(v2026);
        await publish.mailBox().uncheck();
        await publish.ok();
        await visitor.goto(coastalUrl);
        await expect(landing.title()).toHaveText('Coastal Winds');
        await reader.pressHeader('Current');
        await expect(reader.heading()).toHaveText(v2026);

        // "Delete": the question; the row is gone (Rule 19).
        await issues.goto('Back Issues');
        const del = await issues.openQuestion('Back Issues', v2026, 'Delete', TEXT.confirmDelete);
        await expect(del).toContainText(TEXT.confirmDelete);
        await issues.answer(del, 'OK', REQUEST.deleteIssue);
        await expect(issues.issueRow('Back Issues', v2026)).toHaveCount(0);
        await expect(issues.names('Back Issues')).toHaveText([v2025]);

        // After the delete: the top of "Back Issues" is current; the
        // article is offline (Rule 19).
        await reader.gotoHome();
        await reader.pressHeader('Current');
        await expect(reader.heading()).toHaveText(v2025);
        await expectNotFoundPage(visitor, coastalUrl);

        // Control: "Tidal Patterns" stays on its issue's page (Rule 19).
        await tidalOnOlder();
    });

    test('S7: who may open "Issues" and an unpublished issue\'s page', async ({asUser, browser, baseURL}) => {
        test.setTimeout(300_000);
        // The Journal Manager: "Content" › "Issues", and "Preview" (Actors
        // rows 1, 2); the entry sits in the "Content" group (S11's control).
        const {page, issues} = await managerPage(asUser, 'manager.maya', PK);
        await issues.gotoDashboard();
        const {region} = await issues.sideMenuGroup('Content');
        await expect(region.locator('[role="treeitem"][aria-label="Issues"]')).toHaveCount(1);
        await expect(issues.issuesEntry()).toHaveCount(1);
        await issues.openFromSideMenu();
        const issuesUrl = page.url();
        const preview = await issues.openInNewTab('Future Issues', PK_FUTURE, 'Preview');
        const previewReader = new IssueReader(preview, PK);
        await expect(previewReader.heading()).toHaveText(PK_FUTURE);
        await expect(previewReader.previewNotice()).toHaveText(TEXT.preview);
        const previewUrl = preview.url();
        await preview.close();

        // The Section Editor and the Copyeditor: no "Issues" entry, the
        // page refused, the preview open (Actors rows 1, 2; Rule 22).
        for (const username of ['sectioneditor.ana', 'copyeditor.carla']) {
            const {page: p, issues: menu} = await managerPage(asUser, username, PK);
            const r = new IssueReader(p, PK);
            await menu.gotoDashboard();
            // The same read finds the menu's entries ("Assigned to me") and
            // no entry opening the Issues page (Statistics' own "Issues"
            // opens the issue statistics).
            await expect(menu.sideMenuEntry('Assigned to me')).toHaveCount(1);
            await expect(menu.issuesEntry()).toHaveCount(0);
            await p.goto(issuesUrl);
            await r.expectDenied();
            await expect(menu.grid('Future Issues')).toHaveCount(0);
            await p.goto(previewUrl);
            await expect(r.heading()).toHaveText(PK_FUTURE);
            await expect(r.previewNotice()).toHaveText(TEXT.preview);
        }

        // The Author and the Reader: both refused (Actors rows 1, 2).
        for (const username of ['author.alex', 'reader.rosa']) {
            const p = await (await asUser(username)).newPage();
            const r = new IssueReader(p, PK);
            await p.goto(issuesUrl);
            await r.expectDenied();
            await p.goto(previewUrl);
            await r.expectDenied();
            await expect(r.toc()).toHaveCount(0);
        }

        // Signed out: the Login page, for an address naming no issue too
        // (Actors rows 1, 2; Rule 21).
        const {page: visitor, reader} = await visitorPage(browser, baseURL, PK);
        await expectLoginPage(visitor, issuesUrl);
        await expectLoginPage(visitor, previewUrl);
        await expectLoginPage(visitor, reader.issueUrl(999999));

        // Control: everyone's "Current" opens the published issue, and so
        // does the journal's address followed by "issue/current" (Actors
        // row 3; Rule 24; S11's control).
        for (const username of ['manager.maya', 'sectioneditor.ana', 'copyeditor.carla', 'author.alex', 'reader.rosa']) {
            const p = await (await asUser(username)).newPage();
            const r = new IssueReader(p, PK);
            await r.gotoHome();
            await r.pressHeader('Current');
            await expect(r.heading()).toHaveText(PK_PUBLISHED);
        }
        await reader.gotoHome();
        await reader.pressHeader('Current');
        await expect(reader.heading()).toHaveText(PK_PUBLISHED);
        await reader.goto('issue/current');
        await expect(reader.heading()).toHaveText(PK_PUBLISHED);
    });

    test('S8: a journal that requires subscriptions', async ({asUser, ojsApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s8', testInfo);
        const author = `${tag}au`;
        const first = issue(1, 1, 2026);
        const {manager} = await seedJournal(ojsApi, tag, {
            extra: [user(author, 'Ada', 'Author', ['author'])],
            publishingMode: 'subscription',
            issues: [first],
        });
        await article(ojsApi, tag, 'a', author, 'Tidal Patterns', first);
        const {issues} = await managerPage(asUser, manager, tag);
        const name = 'Vol. 1 No. 1 (2026)';

        // The window's tabs gain "Access" (Rule 5; Settings 1).
        await issues.goto('Future Issues');
        let win = await issues.openManagement('Future Issues', name);
        await expect(win.dialog.getByRole('tab')).toHaveText(['Table of Contents', 'Issue Data', 'Issue Galleys', 'Access']);

        // "Access": "Subscription", "Open access date", "Save" (Fields; Rule 3).
        let access = await win.openAccess();
        await expect(access.locator('select#accessStatus option:checked')).toHaveText('Subscription');
        await expect(access.getByText('Open access date', {exact: true})).toBeVisible();
        await expect(access.locator('input[name="openAccessDate-removed"]')).toBeVisible();
        await expect(access.getByRole('button', {name: 'Save', exact: true})).toBeVisible();

        // "Open Access" on the article's row, ticked and kept (Rule 13).
        await win.openTab('Table of Contents');
        await expect(win.tocColumns()).toHaveText(['Title', 'Open Access']);
        await expect(win.openAccessBox('Tidal Patterns')).not.toBeChecked();
        const ticked = await win.tickOpenAccess('Tidal Patterns');
        expect(ticked.ok()).toBe(true);
        await win.close();
        win = await issues.openManagement('Future Issues', name);
        await expect(win.openAccessBox('Tidal Patterns')).toBeChecked();
        await win.close();

        // A new issue is born "Subscription" (Rule 3; Settings 1).
        const {dialog, form} = await issues.openCreate();
        await form.volumeBox().fill('1');
        await form.numberBox().fill('2');
        await form.yearBox().fill('2026');
        await form.showBox('Title').uncheck();
        await form.save();
        await expect(dialog).toHaveCount(0);
        await expect(issues.names('Future Issues')).toHaveText([name, 'Vol. 1 No. 2 (2026)']);
        win = await issues.openManagement('Future Issues', 'Vol. 1 No. 2 (2026)');
        access = await win.openAccess();
        await expect(access.locator('select#accessStatus option:checked')).toHaveText('Subscription');
    });

    test('S10: registered readers only, with the PDF reader off', async ({browser, baseURL, ojsApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s10', testInfo);
        const readerUser = `${tag}rd`;
        await seedJournal(ojsApi, tag, {
            extra: [user(readerUser, 'Rhea', 'Reader', ['reader'])],
            restrictArticleAccess: true,
            plugins: {pdfjsviewerplugin: {enabled: false}},
            issues: [issue(1, 1, 2026, {published: true, galleys: [{label: 'PDF', file: 'article.pdf'}]})],
        });
        const name = 'Vol. 1 No. 1 (2026)';
        const {page: visitor, reader} = await visitorPage(browser, baseURL, tag);

        // Signed out: the page opens with "PDF"; "PDF" opens the Login page
        // (Settings bullet 3).
        await reader.gotoHome();
        await reader.pressHeader('Current');
        await expect(reader.heading()).toHaveText(name);
        await expect(reader.galleyLinks()).toHaveText(['PDF']);
        await reader.galleyLink('PDF').click();
        await expect(visitor).toHaveURL(/\/login(\?|$)/);
        await expect(visitor.locator('input#username')).toBeVisible();

        // Signed in there as the Reader: "PDF" downloads instead of opening
        // the reader (Actors row 4; Settings bullets 3, 5).
        // The Login page sends the Reader on to the galley's address, which
        // may start the download itself; either way the Reader is signed in.
        const downloaded = visitor.waitForEvent('download', {timeout: 30_000}).catch(() => null);
        await new LoginPage(visitor).submitCredentials(readerUser, `${readerUser}${readerUser}`);
        await Promise.race([
            downloaded,
            visitor.waitForURL((u) => !/\/login/.test(u.pathname), {waitUntil: 'commit', timeout: 30_000}),
        ]);
        await reader.gotoHome();
        await reader.pressHeader('Current');
        await expect(reader.galleyLinks()).toHaveText(['PDF']);
        const {download} = await captureDownload(visitor, () => reader.galleyLink('PDF').click());
        expect(download.suggestedFilename()).toMatch(/\.pdf$/);
        await expect(reader.heading()).toHaveText(name);
        await expect(new GalleyReaderPage(visitor).bar()).toHaveCount(0);
    });
});
