// @ts-check
/**
 * @file playwright/tests/serial/U50-issues.spec.js
 *
 * Issues — OJS suite, the serial part: scenarios 1 and 9, which read the
 * issue email. Scenarios 2–8 and 10 are in ../U50-issues.spec.js, whose
 * header lists what the suite deliberately does not cover.
 * Spec: docs/specs/U50-issues.md
 *
 * Why serial: "Publish Issue" queues the issue email as a background job
 * the fleets never run on their own, so the tests drain the queue with
 * runJobs(), which pops the SHARED queue and is only safe in the serial
 * project (patterns.md parallel lesson 7).
 *
 * Seeding: scratch journals with throwaway accounts (the username twice as
 * password), as footnote s0 says: `issues[]` with `published`,
 * `publishingMode: 'none'` (S9), and scratch articles `published` into an
 * `issue` (scheduled when the issue is unpublished). Every absence is
 * paired with a positive control taken the same way (M4, M6): S9's
 * missing issue email is bounded by a "Notify" the test sends to a spare
 * account of its own journal, read after the same drain (A8). The visitor
 * is a browser context with no session (patterns.md lesson 8).
 */
const {test, expect} = require('../../support/fixtures.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');
const {recordBrowserDialogs} = require('../../../../../shared/playwright/pages/SubmissionFilesPages.js');
const {
    ArticleLandingPage,
    expectLoginPage,
    todayCandidates,
} = require('../../../../../shared/playwright/pages/ArticleLandingPages.js');
const {ISSUES_TEXT: TEXT, IssuesAdmin, IssueReader} = require('../../../../../shared/playwright/pages/IssuesPages.js');
const {PublicationScreen} = require('../../pages/PublicationMetadataPages.js');

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
