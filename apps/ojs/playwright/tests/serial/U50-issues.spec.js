// @ts-check
/**
 * @file playwright/tests/serial/U50-issues.spec.js
 *
 * Issues — OJS suite, the serial part: scenarios 1 and 9, which read the
 * issue email, and 3, which reads the mail catcher after the background
 * jobs. Scenarios 2, 4–8 and 10 are in ../U50-issues.spec.js, whose header
 * lists what the suite deliberately does not cover.
 * Spec: docs/specs/U50-issues.md
 *
 * Why serial: "Publish Issue" queues the issue email as a background job
 * the fleets never run on their own, and S3's Control reads the mail
 * catcher after the background jobs too, so the tests drain the queue with
 * runJobs(), which pops the SHARED queue and is only safe in the serial
 * project (patterns.md parallel lesson 7).
 *
 * Seeding: scratch journals with throwaway accounts (the username twice as
 * password), as footnote s0 says: `issues[]` with `published`,
 * `sections[]` with `hideTitle` (S3), `publishingMode: 'none'` (S9), and
 * scratch articles `published` into an `issue` (scheduled when the issue
 * is unpublished). Every absence is paired with a positive control taken
 * the same way (M4, M6): S3's and S9's missing email is bounded by a
 * "Notify" the test sends to a spare account of its own journal, read
 * after the same drain (A8). Every S3 drag is a mouse drag, the row
 * pressed, moved in steps and released on its target (footnote s0), by a
 * local helper (the shared IssuesPages.js is imported by other suites).
 * The visitor is a browser context with no session (patterns.md lesson 8).
 */
const {test, expect} = require('../../support/fixtures.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');
const {recordBrowserDialogs} = require('../../../../../shared/playwright/pages/SubmissionFilesPages.js');
const {WorkflowPage} = require('../../../../../shared/playwright/pages/WorkflowPage.js');
const {ActivityLogWindow} = require('../../../../../shared/playwright/pages/ActivityLogPages.js');
const {SectionsTab} = require('../../../../../shared/playwright/pages/SectionsPages.js');
const {
    ArticleLandingPage,
    expectLoginPage,
    expectNotFoundPage,
    todayCandidates,
} = require('../../../../../shared/playwright/pages/ArticleLandingPages.js');
const {
    ISSUES_TEXT: TEXT,
    ISSUES_REQUEST: REQUEST,
    IssuesAdmin,
    IssueReader,
} = require('../../../../../shared/playwright/pages/IssuesPages.js');
const {PublicationScreen} = require('../../pages/PublicationMetadataPages.js');
const {PublishScreen} = require('../../pages/PublishSchedulePages.js');

const NOTIFY_SUBJECT = 'Discussion (Submission)';

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

/** A whole-text matcher for a grid cell. */
const wholeText = (text) => new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

/**
 * A section heading row of the "Table of Contents" tab (a grid row with no
 * arrow). Local: IssuesPages.js has no reader of it, and other suites
 * import that page object.
 *
 * @param {any} win the IssueWindow
 * @param {string} title
 */
function tocHeadingRow(win, title) {
    return win
        .tocGrid()
        .locator('tr.gridRow:not(.has_extras)')
        .filter({has: win.page.locator('.gridCellContainer', {hasText: wholeText(title)})});
}

/**
 * A mouse drag of a "Table of Contents" row in "Order" (footnote s0, note
 * td18): pressed 40px into the row, moved in steps so jQuery UI's sortable
 * follows, released `where` the target is: 'above' (past its top edge),
 * 'below' (past its bottom edge) or 'onto' (its middle).
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} moving
 * @param {import('@playwright/test').Locator} target
 * @param {'above' | 'below' | 'onto'} where
 */
async function dragTocRow(page, moving, target, where) {
    await moving.scrollIntoViewIfNeeded();
    const from = await moving.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) {
        throw new Error('dragTocRow: a row has no box');
    }
    const x = from.x + 40;
    const y0 = from.y + from.height / 2;
    const dir = where === 'above' ? -1 : where === 'below' ? 1 : Math.sign(to.y - from.y) || 1;
    await page.mouse.move(x, y0);
    await page.mouse.down();
    await page.mouse.move(x, y0 + dir * 6, {steps: 4});
    if (where === 'onto') {
        await page.mouse.move(x, to.y + to.height / 2 - dir * 2, {steps: 25});
        await page.mouse.move(x, to.y + to.height / 2, {steps: 4});
    } else {
        const edge = where === 'above' ? to.y + 4 : to.y + to.height - 4;
        await page.mouse.move(x, edge, {steps: 25});
        await page.mouse.move(x, edge + dir * 12, {steps: 6});
    }
    await page.mouse.up();
}

/**
 * Open the workflow's "Publication Settings" from its side menu, settled.
 * The "Publication" group arrives expanded once the workflow has loaded,
 * so the entry is awaited first and the group pressed only when it stays
 * hidden (a press during the load collapsed it: two repeat runs). The page's
 * form comes from `_components/issue` and its issue assignment from
 * `issueAssignmentStatus`; a "Save" pressed before both answer is lost
 * without a request (patterns.md "Waiting strategy": a page object returns
 * what it opens settled).
 *
 * @param {import('@playwright/test').Page} page
 */
async function openPublicationSettings(page) {
    const entry = page.getByRole('link', {name: 'Publication Settings', exact: true});
    try {
        await expect(entry).toBeVisible({timeout: 15_000});
    } catch {
        await page.getByRole('button', {name: 'Publication', exact: true}).click();
        await expect(entry).toBeVisible({timeout: 30_000});
    }
    const loaded = Promise.all([
        page.waitForResponse((r) => /\/_components\/issue$/.test(new URL(r.url()).pathname) && r.request().method() === 'GET', {timeout: 30_000}),
        page.waitForResponse((r) => r.url().includes('/issueAssignmentStatus') && r.request().method() === 'GET', {timeout: 30_000}),
    ]);
    await entry.click();
    await expect(page.getByRole('heading', {name: 'Publication: Publication Settings'})).toBeVisible({timeout: 30_000});
    await loaded;
    await expect(page.getByRole('radio', {name: 'Assign To Future Issue and Schedule Only'})).toBeChecked({timeout: 30_000});
}

/**
 * Press "Save" on the open Publication Settings page: the publication's
 * save must answer 200 (a refusal fails here with its answer), then the
 * form's "Saved" note.
 *
 * @param {import('@playwright/test').Page} page
 * @param {any} screen a PublicationScreen
 */
async function savePublicationSettings(page, screen) {
    const answered = page.waitForResponse(
        (r) => r.url().includes('/publications/') && r.request().method() === 'POST',
        {timeout: 30_000}
    );
    await screen.saveButton().click();
    const response = await answered;
    const body = (await response.text().catch(() => '')).slice(0, 400);
    expect(response.status(), `Publication Settings "Save" answered ${response.status()}: ${body}`).toBe(200);
    await expect(page.locator('[role="status"]:has-text("Saved")')).toBeVisible({timeout: 30_000});
}

test.describe('issues (serial)', () => {
    test('S1: a journal\'s first issue: created, previewed and published', async ({asUser, browser, baseURL, ojsApi, pkpMail}, testInfo) => {
        test.setTimeout(360_000);
        const tag = makeTag('s1', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        const readerUser = `${tag}rd`;
        const journal = journalName(tag);
        const name = 'Vol. 1 No. 1 (2026)';
        const next = 'Vol. 2 No. 1 (2027)';
        const context = await ojsApi.createContext({
            tag,
            users: [
                user(manager, 'Mona', 'Manager', ['manager']),
                user(author, 'Ada', 'Author', ['author']),
                user(readerUser, 'Rhea', 'Reader', ['reader']),
            ],
            issues: [{volume: 1, number: 1, year: 2026}],
        });
        const issueId = context.issues[0].id;
        await ojsApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            title: 'Tidal Patterns',
            published: true,
            issue: {volume: 1, number: 1, year: 2026},
        });
        const {page, issues} = await managerPage(asUser, manager, tag);
        const {page: visitor, reader} = await visitorPage(browser, baseURL, tag);

        // No current issue yet: "Current", "Archives" and the site's home
        // page's "Current Issue" (Rules 24, 25, 27).
        await reader.gotoHome();
        await reader.pressHeader('Current');
        await expect(reader.heading()).toHaveText(TEXT.noCurrentIssue);
        await expect(reader.breadcrumb()).toHaveText(/^\s*Home\s*\/\s*Archives\s*\/\s*No Current Issue\s*$/);
        await expect(reader.notices()).toHaveText([TEXT.noIssues]);
        await reader.pressHeader('Archives');
        await expect(reader.heading()).toHaveText('Archives');
        await expect(reader.archiveParagraphs()).toHaveText([TEXT.noIssues]);
        await expect(reader.summaries()).toHaveCount(0);
        await reader.gotoSiteHome();
        const entry = reader.siteEntry(journal);
        await expect(entry.getByRole('link', {name: 'View Journal', exact: true})).toBeVisible();
        await entry.getByRole('link', {name: 'Current Issue', exact: true}).click();
        await expect(reader.heading()).toHaveText(TEXT.noCurrentIssue);

        // The "Issues" page: "Future Issues" holds the issue with one item;
        // "Back Issues" reads "No Items" (Fields; Rule 1).
        await issues.gotoDashboard();
        await issues.openFromSideMenu();
        await expect(issues.names('Future Issues')).toHaveText([name]);
        await expect(issues.items('Future Issues', name)).toHaveText('1');
        await issues.showTab('Back Issues');
        await expect(issues.noItems('Back Issues')).toBeVisible();
        await expect(issues.names('Back Issues')).toHaveCount(0);

        // "Create Issue", no part ticked: the notice; the window stays
        // (Rule 4). The "Title" box's arrival is A1's and not read.
        await issues.showTab('Future Issues');
        const {dialog, form} = await issues.openCreate();
        for (const box of ['Volume', 'Number', 'Year']) {
            await expect(form.showBox(box)).toBeChecked();
        }
        await expect(form.dateLine()).toHaveText(TEXT.dateHelp);
        await form.setShowBoxes({Volume: false, Number: false, Year: false, Title: false});
        await form.saveRefused(TEXT.identificationRequired);
        await expect(dialog).toBeVisible();

        // A ticked part left empty: the notice, nothing marked (Rule 4).
        await form.setShowBoxes({Volume: true, Number: true, Year: true});
        await form.volumeBox().fill('2');
        await form.numberBox().fill('1');
        await form.yearBox().fill('');
        await form.saveRefused(TEXT.yearRequired);
        await expect(form.volumeBox()).toHaveValue('2');
        await expect(form.fieldErrors()).toHaveCount(0);

        // A malformed "Volume": under the box and in the notice (Rule 4).
        await form.volumeBox().fill('abc');
        await form.yearBox().fill('2027');
        await form.saveRefused(TEXT.volumeRequired);
        await expect(form.fieldError(TEXT.volumeRequired)).toBeVisible();

        // Saved: the window closes; the list (Rules 1, 2, 3). The date the
        // box shows after the refusals is A4's and not read; it is emptied.
        await form.typeDate('');
        await form.volumeBox().fill('2');
        await form.save();
        await expect(dialog).toHaveCount(0);
        await expect(issues.names('Future Issues')).toHaveText([name, next]);
        await expect(issues.items('Future Issues', next)).toHaveText('0');

        // "Preview": the issue's page in a new tab with the notice (Rule 22).
        const preview = await issues.openInNewTab('Future Issues', name, 'Preview');
        const previewReader = new IssueReader(preview, tag);
        await expect(previewReader.previewNotice()).toHaveText(TEXT.preview);
        await expect(previewReader.heading()).toHaveText(name);
        await expect.poll(() => previewReader.tocOutline()).toEqual(['# Articles', 'Tidal Patterns']);
        await preview.close();

        // "Publish Issue", then "Cancel": the window's parts; the issue
        // stays (Rule 16; Fields).
        let publish = await issues.openPublish(name);
        await expect(publish.mailBox()).toBeChecked();
        expect(await publish.outline()).toEqual([`[x] ${TEXT.mailBox}`, TEXT.publishQuestion, 'Cancel', 'OK']);
        await publish.cancel();
        await expect(issues.names('Future Issues')).toHaveText([name, next]);

        // "Publish Issue", then "OK": the row moves, dated today, no
        // "Current Issue" on it (Rules 1, 16, 17).
        publish = await issues.openPublish(name);
        await publish.ok();
        await expect(issues.names('Future Issues')).toHaveText([next]);
        await issues.showTab('Back Issues');
        await expect(issues.names('Back Issues')).toHaveText([name]);
        expect(todayCandidates()).toContain((await issues.published(name).innerText()).trim());
        const actions = await issues.rowActionNames('Back Issues', name);
        expect(actions).toContain('Unpublish Issue');
        expect(actions).not.toContain('Current Issue');

        // The reader side (Rules 16, 21, 23, 24; Fields).
        await reader.gotoHome();
        await reader.pressHeader('Current');
        await expect(reader.breadcrumb()).toHaveText(/^\s*Home\s*\/\s*Archives\s*\/\s*Vol\. 1 No\. 1 \(2026\)\s*$/);
        await expect(reader.heading()).toHaveText(name);
        await expect(reader.publishedLine()).toBeVisible();
        await expect(reader.previewNotice()).toHaveCount(0);
        const published = (await reader.publishedLine().innerText()).replace(/\s+/g, ' ').trim();
        expect(todayCandidates().map((d) => `Published: ${d}`)).toContain(published);
        expect(await reader.tocOutline()).toEqual(['# Articles', 'Tidal Patterns']);
        await expect(visitor).toHaveTitle(`${name} | ${journal}`);
        const issueUrl = visitor.url();
        await reader.articleLink('Tidal Patterns').click();
        await expect(new ArticleLandingPage(visitor, tag).title()).toHaveText('Tidal Patterns');

        // "Archives" and the site's home page (Rules 25, 27).
        await visitor.goto(issueUrl);
        await reader.pressHeader('Archives');
        await expect(reader.summaryTitles()).toHaveText([name]);
        await reader.summaryTitles().first().click();
        await expect(reader.heading()).toHaveText(name);
        await expect(visitor).toHaveURL(new RegExp(`/issue/view/${issueId}$`));
        await reader.gotoSiteHome();
        await reader.siteEntry(journal).getByRole('link', {name: 'Current Issue', exact: true}).click();
        await expect(reader.heading()).toHaveText(name);

        // The issue email, after the background jobs: to the three accounts,
        // from the Journal Manager, the name linking to the page, the table
        // of contents, the unsubscribe footer (Actors row 5; Side effects).
        runJobs();
        const subject = TEXT.justPublished(name, journal);
        for (const username of [manager, author, readerUser]) {
            const message = await pkpMail.find({to: mailOf(username), subject, timeoutMs: 30_000});
            expect(message.Subject).toBe(subject);
            expect(message.From.Address).toBe(mailOf(manager));
            const full = await pkpMail.fullMessage(message.ID);
            expect(pkpMail.extractLink(full.HTML, name)).toMatch(new RegExp(`/index\\.php/${tag}/issue/view/${issueId}$`));
            expect(full.Text).toContain('Tidal Patterns');
            expect(pkpMail.extractLink(full.HTML, /^unsubscribe$/i)).toMatch(/\/notification\/unsubscribe\?validate=[^&]+&id=\d+$/);
        }

        // Control: the other issue stays in "Future Issues" and out of
        // "Archives" (Rule 25).
        await issues.goto('Future Issues');
        await expect(issues.names('Future Issues')).toHaveText([next]);
        await visitor.goto(issueUrl);
        await reader.pressHeader('Archives');
        await expect(reader.summaryTitles()).toHaveText([name]);
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('S3: the table of contents: its order and a removed article', async ({asUser, browser, baseURL, ojsApi, pkpMail}, testInfo) => {
        test.setTimeout(480_000);
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
        const [storm, , control] = await Promise.all([
            article(ojsApi, tag, 'd', author, 'Storm Surges', future, {section: 'ART'}),
            article(ojsApi, tag, 'f', author, 'A Review of Storms', future, {section: 'REV'}),
            ojsApi.createSubmission({tag: `${tag}e`, context: tag, submitter: spare}),
        ]);
        const {page, issues, dialogs} = await managerPage(asUser, manager, tag);
        const {page: visitor, reader} = await visitorPage(browser, baseURL, tag);
        const name = 'Vol. 1 No. 1 (2026)';
        const futureName = 'Vol. 1 No. 2 (2026)';
        const futureToc = ['# Articles', 'Storm Surges', '# Reviews', 'A Review of Storms'];
        const notices = page.locator('.app__notifications .pkpNotification');

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

        // The scheduled issue: "Storm Surges" under "Articles", then "A
        // Review of Storms" under "Reviews" (Rule 9).
        await issues.showTab('Future Issues');
        win = await issues.openManagement('Future Issues', futureName);
        await expect.poll(() => win.tocOutline()).toEqual(futureToc);
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
        const tocOf = (first, second) => ['# Articles', first, second, '# Reviews', 'A Review of Tides'];
        await ordering.start();
        await win.dragArticle(lower, upper, 'above');
        let done = await ordering.done();
        expect(done.ok()).toBe(true);
        await expect.poll(() => win.tocOutline()).toEqual(tocOf(lower, upper));
        await visitor.reload();
        await expect.poll(() => reader.tocOutline()).toEqual(['# Articles', lower, upper, 'A Review of Tides']);

        // "Order", then "Cancel ordering": the order "Done" saved (Rule 10).
        await ordering.start();
        await win.dragArticle(lower, upper, 'below');
        await ordering.cancel();
        await expect.poll(() => win.tocOutline()).toEqual(tocOf(lower, upper));

        // An article dragged toward another section stays under its own
        // heading; one dropped above its own heading is saved first, the
        // other after it (Rules 10, 10b; footnote s0's mouse drag).
        await ordering.start();
        await dragTocRow(page, win.articleRow('A Review of Tides'), win.articleRow(upper), 'above');
        await expect.poll(() => win.tocOutline()).toEqual(tocOf(lower, upper));
        await dragTocRow(page, win.articleRow(upper), tocHeadingRow(win, 'Articles'), 'above');
        done = await ordering.done();
        expect(done.ok()).toBe(true);
        await expect.poll(() => win.tocOutline()).toEqual(tocOf(upper, lower));
        await visitor.reload();
        await expect.poll(() => reader.tocOutline()).toEqual(['# Articles', upper, lower, 'A Review of Tides']);

        // "Done" shows no message, read once its save is answered and the
        // page's requests are done; the notice area's positive control is
        // the "Issue Data" save at the end, read the same way (Rule 10).
        await ordering.start();
        await win.dragArticle(lower, upper, 'above');
        done = await ordering.done();
        expect(done.ok()).toBe(true);
        await expect.poll(() => win.tocOutline()).toEqual(tocOf(lower, upper));
        await expect(notices).toHaveCount(0);

        // A drag left unsaved: "Issue Data" opens with no question (the
        // drag shown first, so there is something to lose); the question's
        // positive control is a typed "URL Path" on the same tab, which
        // does ask. Back on "Table of Contents" the list is out of "Order"
        // and reads as "Done" saved it (Rule 10; Fields).
        await ordering.start();
        await win.dragArticle(upper, lower, 'above');
        await expect.poll(() => win.tocOutline()).toEqual(tocOf(upper, lower));
        const asked = dialogs.messages.length;
        const data = await win.openData();
        expect(dialogs.messages.slice(asked)).toEqual([]);
        await data.urlPathBox().fill(`${tag}p`);
        await win.openTab('Table of Contents');
        expect(dialogs.messages.slice(asked)).toEqual([TEXT.formChanged]);
        await expect(ordering.orderLink()).toBeVisible();
        await expect(ordering.doneLink()).toBeHidden();
        await expect(ordering.cancelLink()).toBeHidden();
        await expect.poll(() => win.tocOutline()).toEqual(tocOf(lower, upper));

        // A section dragged by its heading: released on its own lower
        // article it leaves the list as it was; "Reviews" dropped above
        // "Articles" carries its article, and "Done" keeps that order on
        // the tab and the issue's page (Rules 10a, 23; Settings 4).
        const reordered = ['# Reviews', 'A Review of Tides', '# Articles', lower, upper];
        await ordering.start();
        await dragTocRow(page, tocHeadingRow(win, 'Articles'), win.articleRow(upper), 'onto');
        await expect.poll(() => win.tocOutline()).toEqual(tocOf(lower, upper));
        await dragTocRow(page, tocHeadingRow(win, 'Reviews'), tocHeadingRow(win, 'Articles'), 'above');
        await expect.poll(() => win.tocOutline()).toEqual(reordered);
        done = await ordering.done();
        expect(done.ok()).toBe(true);
        await expect.poll(() => win.tocOutline()).toEqual(reordered);
        await visitor.reload();
        await expect.poll(() => reader.tocOutline()).toEqual(['A Review of Tides', '# Articles', lower, upper]);

        // The order is this issue's own: the journal's "Sections" and the
        // other issue keep "Articles" first; this issue keeps "Reviews"
        // first (Rule 10a).
        await win.close();
        const sections = new SectionsTab(page, tag);
        await sections.goto();
        await expect(sections.titleCells()).toHaveText(['Articles', 'Reviews']);
        await issues.goto('Future Issues');
        win = await issues.openManagement('Future Issues', futureName);
        await expect.poll(() => win.tocOutline()).toEqual(futureToc);
        await win.close();
        await issues.showTab('Back Issues');
        win = await issues.openManagement('Back Issues', name);
        await expect.poll(() => win.tocOutline()).toEqual(reordered);

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
        const removedAt = new Date();
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

        // An article moved to another section: "Storm Surges"'s
        // "Submission", its "Publication Settings" › "Section" "Reviews",
        // "Save"; the scheduled issue's tab and "Preview" then list both
        // articles under "Reviews", in either order (A22), and no
        // "Articles" heading, whose read is the tab's "Reviews" heading
        // and the visitor's "Articles" above (Rules 10b, 11, 22; Settings 4).
        await issues.goto('Future Issues');
        win = await issues.openManagement('Future Issues', futureName);
        await (await win.articleLink('Storm Surges', 'Submission')).click();
        await frame.expectOpen(storm.submissionId);
        const settings = new PublicationScreen(page, tag);
        await openPublicationSettings(page);
        await page.getByRole('combobox', {name: 'Section', exact: true}).selectOption({label: 'Reviews'});
        await savePublicationSettings(page, settings);
        await issues.goto('Future Issues');
        win = await issues.openManagement('Future Issues', futureName);
        await expect.poll(async () => bySection(await win.tocOutline())).toEqual({
            Reviews: ['A Review of Storms', 'Storm Surges'],
        });
        await win.close();
        const preview = await issues.openInNewTab('Future Issues', futureName, 'Preview');
        const previewReader = new IssueReader(preview, tag);
        await expect(previewReader.previewNotice()).toBeVisible();
        await expect.poll(async () => (await previewReader.tocOutline()).sort()).toEqual(['A Review of Storms', 'Storm Surges']);
        await preview.close();

        // Control: the page keeps the saved order (Rule 23). After the
        // background jobs, no email that arrived since "OK" on "Remove" for
        // the journal's accounts, bounded by a "Notify" to the spare sent
        // after it and read after the same drain (Rule 12; Side effects; A8).
        await visitor.goto(issueUrl);
        await expect.poll(() => reader.tocOutline()).toEqual(['# Articles', lower, upper]);
        const notify = new PublicationScreen(page, tag);
        await notify.gotoWorkflow(control.submissionId);
        await notify.openStage('Submission');
        await notify.notifyParticipant('Xena Spare', `<p>Control ${tag}</p>`);
        runJobs();
        const afterControl = {to: mailOf(spare), subject: NOTIFY_SUBJECT, contains: `Control ${tag}`, since: removedAt};
        for (const username of [author, manager]) {
            await pkpMail.expectNone({to: mailOf(username), since: removedAt, afterControl});
        }

        // The notice area's positive control for "Done"'s silence: an
        // "Issue Data" save shows "Your changes have been saved." there.
        await issues.goto('Future Issues');
        win = await issues.openManagement('Future Issues', futureName);
        const form = await win.openData();
        await form.save();
        await expect(notices.filter({hasText: TEXT.saved}).first()).toBeVisible();
    });

    test('S9: a journal that does not publish online', async ({asUser, browser, baseURL, ojsApi, pkpMail}, testInfo) => {
        test.setTimeout(360_000);
        const tag = makeTag('s9', testInfo);
        const accounts = {
            manager: `${tag}mg`,
            sectionEditor: `${tag}se`,
            subscriptionManager: `${tag}sm`,
            reader: `${tag}rd`,
            author: `${tag}au`,
            externalReviewer: `${tag}rv`,
        };
        const spare = `${tag}x`;
        const journal = journalName(tag);
        const published = 'Vol. 1 No. 1 (2026)';
        const later = 'Vol. 1 No. 2 (2026)';
        await ojsApi.createContext({
            tag,
            publishingMode: 'none',
            users: [
                ...Object.entries(accounts).map(([role, username]) => user(username, role.slice(0, 6), 'Tester', [role])),
                user(spare, 'Xena', 'Spare', ['author']),
            ],
            issues: [{volume: 1, number: 1, year: 2026, published: true}, {volume: 1, number: 2, year: 2026}],
        });
        const [, control] = await Promise.all([
            ojsApi.createSubmission({
                tag,
                context: tag,
                submitter: accounts.author,
                title: 'Tidal Patterns',
                published: true,
                issue: {volume: 1, number: 1, year: 2026},
            }),
            ojsApi.createSubmission({tag: `${tag}c`, context: tag, submitter: spare}),
        ]);
        const {page, issues} = await managerPage(asUser, accounts.manager, tag);

        // The addresses: "View" opens the issue's page in a new tab; the
        // article's from there (Actors row 3).
        await issues.goto('Back Issues');
        const view = await issues.openInNewTab('Back Issues', published, 'View');
        const viewReader = new IssueReader(view, tag);
        await expect(viewReader.heading()).toHaveText(published);
        const issueUrl = view.url();
        await viewReader.articleLink('Tidal Patterns').click();
        await expect(new ArticleLandingPage(view, tag).title()).toHaveText('Tidal Patterns');
        const articleUrl = view.url();
        await view.close();

        /** No "Current" and no "Archives" in the header; "About" is there (the same read). */
        const expectNoIssueLinks = async (r) => {
            await r.gotoHome();
            await expect(r.headerLink('About')).toHaveCount(1);
            await expect(r.headerLink('Current')).toHaveCount(0);
            await expect(r.headerLink('Archives')).toHaveCount(0);
        };

        // Signed out: no header links, no "Current Issue" on the home page;
        // both addresses open the Login page (Settings bullet 1; Actors row 3).
        const {page: visitor, reader} = await visitorPage(browser, baseURL, tag);
        await expectNoIssueLinks(reader);
        await expect(visitor.locator('.pkp_structure_main')).toBeVisible();
        await expect(visitor.locator('.current_issue')).toHaveCount(0);
        await expectLoginPage(visitor, issueUrl);
        await expectLoginPage(visitor, articleUrl);

        // The Reader, the Author and the Reviewer: refused with the
        // not-online message (Settings bullet 1; Actors row 3).
        for (const username of [accounts.reader, accounts.author, accounts.externalReviewer]) {
            const p = await (await asUser(username)).newPage();
            const r = new IssueReader(p, tag);
            await expectNoIssueLinks(r);
            await p.goto(issueUrl);
            await r.expectDenied(TEXT.notOnline);
            await p.goto(articleUrl);
            await r.expectDenied(TEXT.notOnline);
        }

        // The Section Editor and the Subscription Manager: no header links,
        // the issue's page and the article's page open (Actors row 3).
        for (const username of [accounts.sectionEditor, accounts.subscriptionManager]) {
            const p = await (await asUser(username)).newPage();
            const r = new IssueReader(p, tag);
            await expectNoIssueLinks(r);
            await p.goto(issueUrl);
            await expect(r.heading()).toHaveText(published);
            await expect(r.articleLink('Tidal Patterns')).toHaveCount(1);
            await p.goto(articleUrl);
            await expect(new ArticleLandingPage(p, tag).title()).toHaveText('Tidal Patterns');
        }

        // "Publish Issue": "OK" moves the issue; after the background jobs
        // no issue email reached any account, bounded by a "Notify" to the
        // spare read after the same drain (Settings bullet 1; A8). The
        // box's arrival state is A15's and not read.
        await issues.showTab('Future Issues');
        const publish = await issues.openPublish(later);
        await publish.ok();
        await issues.showTab('Back Issues');
        await expect(issues.names('Back Issues')).toHaveText([later, published]);
        const notify = new PublicationScreen(page, tag);
        await notify.gotoWorkflow(control.submissionId);
        await notify.openStage('Submission');
        await notify.notifyParticipant('Xena Spare', `<p>Control ${tag}</p>`);
        runJobs();
        const afterControl = {to: mailOf(spare), subject: NOTIFY_SUBJECT, contains: `Control ${tag}`};
        const subject = TEXT.justPublished(later, journal);
        for (const username of Object.values(accounts)) {
            await pkpMail.expectNone({to: mailOf(username), subject, afterControl});
        }

        // Control: the seeded journal, which publishes online, offers
        // "Current" and "Archives" to the signed-out visitor (Settings 1).
        const pk = new IssueReader(visitor, 'publicknowledge');
        await pk.gotoHome();
        await expect(pk.headerLink('Current')).toHaveCount(1);
        await expect(pk.headerLink('Archives')).toHaveCount(1);
        await expect(visitor.locator('.current_issue')).toHaveCount(1);
    });
});
