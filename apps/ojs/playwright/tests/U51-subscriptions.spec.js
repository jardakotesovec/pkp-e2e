// @ts-check
/**
 * @file playwright/tests/U51-subscriptions.spec.js
 *
 * Subscriptions & open access control — OJS suite, the parallel part: one
 * test per canonical scenario the journal runs outside the serial project
 * (S1–S11, S13–S15). S12 runs the site's scheduled task and background
 * jobs, so it lives in ./serial/U51-subscriptions.spec.js. S16 is the
 * press's and the preprint server's absence, in the OMP and OPS trees;
 * its journal-side control (the "Subscriptions" page and "My
 * Subscriptions" opening) rides in S8 and S9 here.
 * Spec: docs/specs/U51-subscriptions.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A7 🐞: S3 never reads the padlock the issue's page shows the reading
 *   roles.
 * - A10 🐞: S9 reads the "Purchase" button on an active subscription,
 *   never presses it.
 * - A13 🐞: S9 never reads the "Subscription" block while the purchase
 *   awaits payment.
 * - A16 🐞: S4 never reads "Institutions" in the Subscription Manager's
 *   side menu.
 * - A17 🐞: S13 never reads the "Delayed Open Access" box's arrival state.
 * - A5 ❓: S3 reads that the Reader's "PDF" does not open, never where the
 *   Reader lands.
 * - A6 ❓: S14 reads the payment page of a "Purchase Article" fee, never
 *   pays it.
 * - A1, A4, A8, A9, A11, A12, A14, A15, A18–A27, OPS1: not on these
 *   scenarios' paths.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are never touched. Every test seeds its own scratch journal with
 * throwaway accounts (the username twice as password), as footnote s0
 * says: `publishingMode`, `payments` (with `purchaseArticleFee` in S14),
 * the subscription contact and `subscriptionExpiryPartial`,
 * `subscriptionTypes[]`, `subscriptions[]`, `institutions[]`, `sidebar`,
 * `issues[]` (with `galleys`, `datePublished`, `accessStatus`),
 * `restrictArticleAccess` (S15), and
 * scratch articles `published` into an `issue` with their galleys
 * (`accessStatus: 'open'` for a ticked "Open Access" box). S9 also names
 * the journal's principal contact, the recipient of its mail control
 * (the payment notification sent from "Renew"'s payment page).
 *
 * Every absence is read settled and paired with a positive control taken
 * the same way (M4, M6); S6's and S9's mailbox silence is bounded by a
 * later mail the test causes and finds (A8). Browser dialogs are recorded
 * and answered on every manager page ("The data on this form has
 * changed…"). The visitor is the fixture's own page, which carries no
 * session in a test that sets no `user` (patterns.md lesson 8); every
 * signed-in actor is an `asUser` context. Dates are the server's (UTC,
 * the config's zone). Waits are web-first or bounded by the screen's own
 * answer (A5).
 */
const {test, expect} = require('../support/fixtures.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {ReaderHeader} = require('../../../../shared/playwright/pages/NotificationsPages.js');
const {recordBrowserDialogs} = require('../../../../shared/playwright/pages/SubmissionFilesPages.js');
const {
    ArticleLandingPage,
    ArticleSummaries,
    GalleyReaderPage,
    expectLoginPage,
} = require('../../../../shared/playwright/pages/ArticleLandingPages.js');
const {IssuesAdmin, IssueReader, notice} = require('../../../../shared/playwright/pages/IssuesPages.js');
const {
    SUBSCRIPTIONS_TEXT: TEXT,
    SUBSCRIPTIONS_REQUEST: REQUEST,
    GLYPH,
    AccessSettings,
    PaymentsPage,
    EditorialSideMenu,
    InstitutionsPage,
    SubscriptionsReader,
    MySubscriptionsPage,
    PurchasePage,
    ManualPaymentPage,
    SubscriptionBlock,
    galleyLink,
    expectLocked,
    expectUnlocked,
    feeWords,
    lockWords,
    loginMessage,
    refusal,
    flat,
} = require('../../../../shared/playwright/pages/SubscriptionsPages.js');

const ISSUE = 'Vol. 1 No. 1 (2026)';
const PAY = {currency: 'USD', paymentPluginName: 'ManualPayment', manualInstructions: 'Pay by bank transfer.'};
const CONTACT = {
    subscriptionName: 'Subscriptions Desk',
    subscriptionEmail: 'desk@mail.test',
    subscriptionMailingAddress: '1 Harbour Road',
};
const PDF = [{label: 'PDF', file: 'article.pdf'}];
/** A PDF galley's address, and a "Full Issue" galley's. */
const ARTICLE_GALLEY = /\/article\/view\/\d+\/\d+$/;
const ISSUE_GALLEY = /\/issue\/view\/\d+\/\d+$/;

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u51${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (users.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles = ['reader']) {
    return {username, givenName, familyName, email: mailOf(username), roles};
}

/** A throwaway account's password (the username twice). */
const pw = (username) => `${username}${username}`;

/** A scratch journal's name as the scenario API gives it. */
const journalName = (tag) => `Scratch context ${tag}`;

/** An issue key for `issues[]` and a submission's `issue`. */
const issue = (volume, number, year, extra = {}) => ({volume, number, year, ...extra});

/** Dates as the pages write them (`YYYY-MM-DD`), counted from today (UTC). */
const iso = (d) => d.toISOString().slice(0, 10);
function days(n) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + n);
    return iso(d);
}
function months(n) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + n);
    return iso(d);
}
const TODAY = () => days(0);

/** The id `createContext` gave a throwaway account. */
function idOf(context, username) {
    const found = (context.users || []).find((u) => u.username === username);
    expect(found, `seeded user ${username}`).toBeTruthy();
    return found.id;
}

/**
 * Seed a scratch journal that requires subscriptions, with a throwaway
 * Journal Manager and an Author (the articles' submitter) beside `extra`.
 */
async function seedJournal(ojsApi, tag, {extra = [], ...keys} = {}) {
    const users = [user(`${tag}mg`, 'Mona', 'Manager', ['manager']), user(`${tag}au`, 'Ada', 'Author', ['author']), ...extra];
    const context = await ojsApi.createContext({tag, users, publishingMode: 'subscription', ...keys});
    return {manager: `${tag}mg`, author: `${tag}au`, context};
}

/** A published scratch article with a "PDF" galley (unless `galleys` says otherwise). */
function article(ojsApi, tag, key, title, issueKey, extra = {}) {
    return ojsApi.createSubmission({
        tag: `${tag}${key}`,
        context: tag,
        submitter: `${tag}au`,
        title,
        published: true,
        issue: {volume: issueKey.volume, number: issueKey.number, year: issueKey.year},
        galleys: PDF,
        ...extra,
    });
}

/** An actor's page (an `asUser` context), its browser dialogs recorded. */
async function actorPage(asUser, username) {
    const page = await (await asUser(username)).newPage();
    return {page, dialogs: recordBrowserDialogs(page)};
}

/** The reader-side page objects of a scratch journal on `page`. */
function readerSide(page, tag) {
    return {
        reader: new IssueReader(page, tag),
        landing: new ArticleLandingPage(page, tag),
        block: new SubscriptionBlock(page),
    };
}

/** An article page's galley link by label. */
const articleGalley = (landing, label = 'PDF') => galleyLink(landing.sideColumn(), label);

/** A table-of-contents summary's galley link by the article's title and the label. */
function tocGalley(reader, title, label = 'PDF') {
    return galleyLink(new ArticleSummaries(reader.page, reader.toc()).summary(title), label);
}

/** The issue's "Full Issue" galley link by label. */
const fullIssueGalley = (reader, label = 'PDF') => galleyLink(reader.toc().locator('.galleys'), label);

/**
 * Type a date into a subscription window's box that already shows it
 * after a refused save: the box takes a typed date only when it differs
 * from the one shown (T-ojs-2), so another day goes in first.
 */
async function retypeDate(win, which, value) {
    await win.typeDate(which, value === days(-1) ? days(-2) : days(-1));
    await win.typeDate(which, value);
}

/** Press a link and wait for the page it leads to (redirects followed); returns the address. */
async function pressAndLand(page, link) {
    await Promise.all([page.waitForNavigation({waitUntil: 'load', timeout: 30_000}), link.click()]);
    return page.url();
}

/** Press a galley link: the PDF (or HTML) reader opens at the galley's address. */
async function expectOpens(page, link, address = ARTICLE_GALLEY) {
    await link.click();
    await expect(page).toHaveURL(address, {timeout: 30_000});
    await new GalleyReaderPage(page).expectLoaded();
}

/** Press a galley link: the reader lands elsewhere than the galley. */
async function expectNotOpened(page, link) {
    const landed = await pressAndLand(page, link);
    expect(landed).not.toMatch(ARTICLE_GALLEY);
    expect(landed).not.toMatch(ISSUE_GALLEY);
    await expect(new GalleyReaderPage(page).bar()).toHaveCount(0);
    return landed;
}

/** Press a galley link signed out: the Login page with `message`. */
async function expectLoginWith(page, link, message) {
    await link.click();
    await expect(page).toHaveURL(/\/login\?/, {timeout: 30_000});
    await expect(page.locator('input#username')).toBeVisible();
    await expect(loginMessage(page, message)).toBeVisible();
}

/** Open the current issue from the header's "Current", then an article from it. */
async function openFromCurrent(reader, landing, title) {
    await reader.gotoHome();
    await reader.pressHeader('Current');
    await reader.articleLink(title).click();
    await expect(landing.title()).toHaveText(title, {timeout: 30_000});
}

/** Open an issue from "Archives" by its name. */
async function openFromArchives(reader, name) {
    await reader.gotoHome();
    await reader.pressHeader('Archives');
    await reader.summary(name).locator('a.title').click();
    await expect(reader.heading()).toHaveText(name, {timeout: 30_000});
}

test.describe('subscriptions', () => {
    test('S1: a journal that requires subscriptions, and back to open access', async ({page, asUser, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s1', testInfo);
        const first = issue(1, 1, 2026, {published: true});
        const {manager} = await seedJournal(ojsApi, tag, {issues: [first]});
        await article(ojsApi, tag, 'a', 'Tidal Patterns', first);
        const {reader, landing} = readerSide(page, tag);
        const {page: mg} = await actorPage(asUser, manager);
        const access = new AccessSettings(mg, tag);

        /** The control: the issue's page, "Archives" and the article open, locked or not (Rule 8). */
        const pagesOpen = async () => {
            await reader.gotoHome();
            await reader.pressHeader('Current');
            await expect(reader.heading()).toHaveText(ISSUE);
            await reader.pressHeader('Archives');
            await expect(reader.heading()).toHaveText('Archives');
            await expect(reader.summary(ISSUE)).toHaveCount(1);
            await openFromCurrent(reader, landing, 'Tidal Patterns');
        };

        // The locked link: the article's page opens with its title, its
        // "PDF" shows the padlock and "Requires Subscription" (Rules 7, 8, 10).
        await pagesOpen();
        await expectLocked(articleGalley(landing));

        // Refused, signed out: the Login page with the message (Rule 12).
        await expectLoginWith(page, articleGalley(landing), TEXT.loginSubscription);

        // The "Access" tab: the second choice selected, "Delayed Open
        // Access" under it (Rule 3; Fields).
        await access.goto();
        await expect(access.modeRadios()).toHaveCount(3);
        await expect(access.modeRadio(TEXT.modeSubscription)).toBeChecked();
        await expect(access.delayedList()).toBeVisible();

        // Open access chosen: "Saved", "Delayed Open Access" gone; the
        // choice kept on a fresh load (Rule 5).
        await access.modeRadio(TEXT.modeOpen).check();
        await access.save();
        await expect(access.delayedList()).toBeHidden();
        await access.goto();
        await expect(access.modeRadio(TEXT.modeOpen)).toBeChecked();
        await expect(access.modeRadio(TEXT.modeSubscription)).not.toBeChecked();

        // The reader side, open: the file icon, no padlock; the PDF opens (Rule 2).
        await pagesOpen();
        await expectUnlocked(articleGalley(landing), GLYPH.pdf);
        await expectOpens(page, articleGalley(landing));

        // Subscriptions again: the padlock is back, the issue kept
        // "Subscription" (Rules 3, 7).
        await access.modeRadio(TEXT.modeSubscription).check();
        await access.save();
        await pagesOpen();
        await expectLocked(articleGalley(landing));
    });

    test('S2: subscribers, non-subscribers and the "Subscription" block', async ({page, asUser, ojsApi}, testInfo) => {
        test.setTimeout(360_000);
        const tag = makeTag('s2', testInfo);
        const sam = `${tag}sam`;
        const lena = `${tag}lena`;
        const eve = `${tag}eve`;
        const nova = `${tag}nova`;
        const samEnd = months(11);
        const eveEnd = days(-30);
        const first = issue(1, 1, 2026, {published: true});
        await seedJournal(ojsApi, tag, {
            extra: [user(sam, 'Sam', 'Stone'), user(lena, 'Lena', 'Lark'), user(eve, 'Eve', 'Ember'), user(nova, 'Nova', 'Reed')],
            payments: PAY,
            sidebar: ['subscriptionblockplugin'],
            subscriptionTypes: [
                {name: 'Online Year', cost: 40, currency: 'USD', duration: 12},
                {name: 'Lifetime', cost: 300, currency: 'USD'},
            ],
            subscriptions: [
                {user: sam, type: 'Online Year', dateStart: days(-30), dateEnd: samEnd},
                {user: lena, type: 'Lifetime'},
                {user: eve, type: 'Online Year', dateStart: '2025-01-01', dateEnd: eveEnd},
            ],
            issues: [first],
        });
        await article(ojsApi, tag, 'a', 'Tidal Patterns', first);
        const {reader, landing, block} = readerSide(page, tag);

        // Control, the visitor: the issue's page locks "PDF" (Rule 10).
        await reader.gotoHome();
        await reader.pressHeader('Current');
        await expectLocked(tocGalley(reader, 'Tidal Patterns'));

        // Signed out: the padlock, the block's login line; "PDF" opens the
        // Login page, where Sam signs in and the PDF opens (Rules 10, 12, 17, 33).
        await reader.articleLink('Tidal Patterns').click();
        await expect(landing.title()).toHaveText('Tidal Patterns');
        await expectLocked(articleGalley(landing));
        await expect(block.title()).toHaveText(TEXT.blockTitle);
        await expect(block.lines()).toHaveText([TEXT.blockLogin]);
        await expectLoginWith(page, articleGalley(landing), TEXT.loginSubscription);
        await new LoginPage(page).submitCredentials(sam, pw(sam));
        await expect(page).toHaveURL(ARTICLE_GALLEY, {timeout: 30_000});
        await new GalleyReaderPage(page).expectLoaded();

        // Sam, active: no padlock; the block's type, end date and "My
        // Subscriptions"; the same on "My Subscriptions" (Rules 27, 33).
        await openFromCurrent(reader, landing, 'Tidal Patterns');
        await expectUnlocked(articleGalley(landing), GLYPH.pdf);
        await expect(block.lines()).toHaveText(['Online Year', TEXT.expires(samEnd), TEXT.mySubscriptions]);
        await expect(block.link(TEXT.mySubscriptions)).toBeVisible();
        const my = new MySubscriptionsPage(page, tag);
        await my.goto();
        await my.expectOpen();
        let cells = await my.rowCells(my.rows(my.individualPart()));
        expect(cells.slice(0, 2)).toEqual(['Online Year', TEXT.expires(samEnd)]);
        // Control, Sam: the issue's page shows no padlock.
        await reader.gotoHome();
        await reader.pressHeader('Current');
        await expectUnlocked(tocGalley(reader, 'Tidal Patterns'), GLYPH.pdf);

        // Lena, non-expiring: the PDF opens; "Non-expiring" in the block
        // and on "My Subscriptions" (Rules 17, 27, 33).
        const {page: lp} = await actorPage(asUser, lena);
        const L = readerSide(lp, tag);
        await openFromCurrent(L.reader, L.landing, 'Tidal Patterns');
        await expect(L.block.lines()).toHaveText(['Lifetime', TEXT.nonExpiring, TEXT.mySubscriptions]);
        await expectOpens(lp, articleGalley(L.landing));
        const lmy = new MySubscriptionsPage(lp, tag);
        await lmy.goto();
        cells = await lmy.rowCells(lmy.rows(lmy.individualPart()));
        expect(cells.slice(0, 2)).toEqual(['Lifetime', TEXT.nonExpiring]);
        await L.reader.gotoHome();
        await L.reader.pressHeader('Current');
        await expectUnlocked(tocGalley(L.reader, 'Tidal Patterns'), GLYPH.pdf);

        // Eve, expired: the padlock; "PDF" opens the "Subscriptions" page;
        // "Expired:" with her end date (Rules 12, 17, 23, 27, 33).
        const {page: ep} = await actorPage(asUser, eve);
        const E = readerSide(ep, tag);
        await openFromCurrent(E.reader, E.landing, 'Tidal Patterns');
        await expectLocked(articleGalley(E.landing));
        await expect(E.block.lines()).toHaveText(['Online Year', TEXT.expired(eveEnd), TEXT.mySubscriptions]);
        const esubs = new SubscriptionsReader(ep, tag);
        await pressAndLand(ep, articleGalley(E.landing));
        await esubs.expectOpen();
        const emy = new MySubscriptionsPage(ep, tag);
        await emy.goto();
        cells = await emy.rowCells(emy.rows(emy.individualPart()));
        expect(cells.slice(0, 2)).toEqual(['Online Year', TEXT.expired(eveEnd)]);
        await E.reader.gotoHome();
        await E.reader.pressHeader('Current');
        await expectLocked(tocGalley(E.reader, 'Tidal Patterns'));

        // Nova, none: the padlock; "PDF" opens the "Subscriptions" page;
        // the block's "A subscription is required…" and "Learn More" (Rules 12, 33).
        const {page: np} = await actorPage(asUser, nova);
        const N = readerSide(np, tag);
        await openFromCurrent(N.reader, N.landing, 'Tidal Patterns');
        await expectLocked(articleGalley(N.landing));
        await expect(N.block.lines()).toHaveText([`${TEXT.blockRequired} ${TEXT.learnMore}`]);
        const nsubs = new SubscriptionsReader(np, tag);
        await pressAndLand(np, articleGalley(N.landing));
        await nsubs.expectOpen();
        await N.reader.gotoHome();
        await N.reader.pressHeader('Current');
        await expectLocked(tocGalley(N.reader, 'Tidal Patterns'));
        await N.block.link(TEXT.learnMore).click();
        await nsubs.expectOpen();
    });

    test('S3: reading roles, the article\'s Author and the open pages', async ({page, asUser, ojsApi}, testInfo) => {
        test.setTimeout(420_000);
        const tag = makeTag('s3', testInfo);
        const se = `${tag}se`;
        const ce = `${tag}ce`;
        const sm = `${tag}sm`;
        const rd = `${tag}rd`;
        const first = issue(1, 1, 2026, {published: true, galleys: PDF});
        const {author} = await seedJournal(ojsApi, tag, {
            extra: [
                user(se, 'Sela', 'Editor', ['sectionEditor']),
                user(ce, 'Cora', 'Copy', ['copyeditor']),
                user(sm, 'Sumi', 'Subs', ['subscriptionManager']),
                user(rd, 'Rhea', 'Reader', ['reader']),
            ],
            issues: [first],
        });
        await article(ojsApi, tag, 'a', 'Tidal Patterns', first);

        /** The open pages: "Current", "Archives", the article (Actors row 4; Rule 8). */
        const openPages = async (p) => {
            const {reader, landing} = readerSide(p, tag);
            await reader.gotoHome();
            await reader.pressHeader('Current');
            await expect(reader.heading()).toHaveText(ISSUE);
            await expect(reader.articleLink('Tidal Patterns')).toBeVisible();
            await reader.pressHeader('Archives');
            await expect(reader.heading()).toHaveText('Archives');
            await reader.summary(ISSUE).locator('a.title').click();
            await expect(reader.heading()).toHaveText(ISSUE);
            await reader.articleLink('Tidal Patterns').click();
            await expect(landing.title()).toHaveText('Tidal Patterns');
            return {reader, landing};
        };

        // The Section Editor, the Copyeditor and the Subscription Manager:
        // the pages open; the article's and the issue's "PDF" open (Rule 11a).
        for (const username of [se, ce, sm]) {
            const {page: p} = await actorPage(asUser, username);
            const {reader, landing} = await openPages(p);
            await expectOpens(p, articleGalley(landing));
            await reader.gotoHome();
            await reader.pressHeader('Current');
            await expectOpens(p, fullIssueGalley(reader), ISSUE_GALLEY);
        }

        // The article's Author: the PDF opens (Rule 11a).
        const {page: ap} = await actorPage(asUser, author);
        const A = await openPages(ap);
        await expectOpens(ap, articleGalley(A.landing));

        // Control: the Reader's "PDF" does not open; the visitor's opens the
        // Login page (Rule 12).
        const {page: rp} = await actorPage(asUser, rd);
        const R = await openPages(rp);
        await expectNotOpened(rp, articleGalley(R.landing));
        const V = await openPages(page);
        await expectLoginWith(page, articleGalley(V.landing), TEXT.loginSubscription);
    });

    test('S4: who opens the "Payments" page; the Subscription Manager signing in', async ({page, asUser, browser, baseURL, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        const sm = `${tag}sm`;
        const se = `${tag}se`;
        const rd = `${tag}rd`;
        const {manager} = await seedJournal(ojsApi, tag, {
            extra: [user(sm, 'Sumi', 'Subs', ['subscriptionManager']), user(se, 'Sela', 'Editor', ['sectionEditor']), user(rd, 'Rhea', 'Reader', ['reader'])],
            payments: PAY,
            subscriptionTypes: [{name: 'Campus Year', cost: 400, currency: 'USD', duration: 12, institutional: true}],
        });

        // The Journal Manager: the side menu's "Payments" opens the page
        // headed "Subscriptions", six tabs, open on an empty "Individual
        // Subscriptions" (Actors row 1; Fields).
        const {page: mg} = await actorPage(asUser, manager);
        const mgPayments = new PaymentsPage(mg, tag);
        await mg.goto(`/index.php/${tag}/dashboard/editorial`);
        const mgMenu = new EditorialSideMenu(mg);
        await mgMenu.entry('Payments').click();
        await expect(mg).toHaveURL(/\/payments$/);
        await expect(mgPayments.heading()).toHaveText('Subscriptions');
        await expect(mgPayments.tabs()).toHaveText(TEXT.tabs);
        await expect(mgPayments.selectedTab()).toHaveText('Individual Subscriptions');
        await expect(mgPayments.noItems('Individual Subscriptions')).toBeVisible();

        // The Subscription Manager signs in: the access-denied page, no
        // side menu (Actors row 9). The user menu's "Dashboard" leads to
        // "user/profile" instead (T-ojs-1, `.reports/U51/test-ojs-findings.md`),
        // so the refusal is read at the dashboard's own address.
        const smContext = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
        const sp = await smContext.newPage();
        recordBrowserDialogs(sp);
        const login = new LoginPage(sp);
        await login.gotoContext(tag);
        await login.signIn(sm, pw(sm));
        await expect(sp).toHaveURL(/\/user\/authorizationDenied/, {timeout: 30_000});
        await expect(sp.getByText(TEXT.roleDenied, {exact: true})).toBeVisible();
        const smMenu = new EditorialSideMenu(sp);
        await expect(smMenu.anyEntry()).toHaveCount(0);
        const userMenu = new ReaderHeader(sp);
        await userMenu.open();
        await expect(userMenu.entry('Dashboard')).toBeVisible();
        await sp.goto(`/index.php/${tag}/dashboard/editorial`);
        await expect(sp).toHaveURL(/\/user\/authorizationDenied/, {timeout: 30_000});
        await expect(sp.getByText(TEXT.roleDenied, {exact: true})).toBeVisible();

        // The Subscription Manager at the address: the six tabs; the side
        // menu's "Start A New Submission" and "Payments" (Actors rows 1, 9).
        const smPayments = new PaymentsPage(sp, tag);
        await smPayments.goto();
        await expect(smPayments.heading()).toHaveText('Subscriptions');
        await expect(smPayments.tabs()).toHaveText(TEXT.tabs);
        await expect(smMenu.entry('Start A New Submission')).toBeVisible();
        await expect(smMenu.entry('Payments')).toBeVisible();

        // No institution yet: the institutional window says so at once (Rule 19).
        await smPayments.showTab('Institutional Subscriptions');
        const win = await smPayments.openCreateSubscription('Institutional Subscriptions');
        await expect(win.dialog).toContainText(TEXT.institutionFirst);
        await win.close();

        // Control: the Subscription Manager's "Subscription Types" lists
        // "Campus Year", "Institutional" (Actors row 1; Fields).
        await smPayments.showTab('Subscription Types');
        const cells = await smPayments.rowCells('Subscription Types', 'Campus Year');
        expect(cells.slice(0, 2)).toEqual(['Campus Year', 'Institutional']);

        // The Section Editor and the Reader: the access-denied page (Actors row 1).
        for (const username of [se, rd]) {
            const {page: p} = await actorPage(asUser, username);
            await p.goto(`/index.php/${tag}/payments`);
            await expect(p).toHaveURL(/\/user\/authorizationDenied/);
            await expect(p.getByText(TEXT.roleDenied, {exact: true})).toBeVisible();
        }

        // Signed out: the Login page (Actors row 1).
        await expectLoginPage(page, `/index.php/${tag}/payments`);
    });

    test('S5: subscription types: created, edited and deleted', async ({asUser, ojsApi}, testInfo) => {
        test.setTimeout(360_000);
        const tag = makeTag('s5', testInfo);
        const sam = `${tag}sam`;
        const tess = `${tag}tess`;
        const first = issue(1, 1, 2026, {published: true});
        const {manager} = await seedJournal(ojsApi, tag, {
            extra: [user(sam, 'Sam', 'Stone'), user(tess, 'Tess', 'Tide')],
            subscriptionTypes: [
                {name: 'Old Rate', cost: 30, currency: 'USD', duration: 12},
                {name: 'Other Rate', cost: 35, currency: 'USD', duration: 12},
            ],
            subscriptions: [{user: sam, type: 'Old Rate'}, {user: tess, type: 'Other Rate'}],
            issues: [first],
        });
        await article(ojsApi, tag, 'a', 'Tidal Patterns', first);
        const {page: mg, dialogs} = await actorPage(asUser, manager);
        const payments = new PaymentsPage(mg, tag);
        const types = 'Subscription Types';

        // An empty window: neither kind ticked; "Save": "This field is
        // required." under "Name of Type" (Fields; Rule 15).
        await payments.gotoTab(types);
        let win = await payments.openCreateType();
        await expect(win.kindRadio(TEXT.individual)).not.toBeChecked();
        await expect(win.kindRadio(TEXT.institutional)).not.toBeChecked();
        await win.saveButton().click();
        await expect(win.nameBox().locator('xpath=following::label[contains(concat(" ",normalize-space(@class)," ")," error ")][1]')).toContainText(TEXT.fieldRequired);

        // A cost that is not a number: the window stays, nothing under
        // "Cost", the notice (Rule 15).
        await win.fill({name: 'Online Year', currency: 'USD', cost: 'forty', format: 'Online', duration: '12'});
        await win.saveRefused();
        await expect(notice(mg, TEXT.costNotNumber).first()).toBeVisible();
        await expect(win.fieldErrors()).toHaveCount(0);

        // A duration that is not a number (Rule 15).
        await win.fill({cost: '40', duration: 'a'});
        await win.saveRefused();
        await expect(notice(mg, TEXT.durationNotNumber).first()).toBeVisible();

        // Saved, neither kind ticked: the list ends with "Online Year",
        // "Individual", "1 year", "40.00 (USD)" (Rules 14, 15).
        await win.fill({duration: '12'});
        await win.saveAccepted();
        await expect(notice(mg, TEXT.saved).first()).toBeVisible();
        await expect.poll(() => payments.firstCells(types)).toEqual(['Old Rate', 'Other Rate', 'Online Year']);
        expect(await payments.rowCells(types, 'Online Year')).toEqual(['Online Year', 'Individual', '1 year', '40.00 (USD)']);

        // Non-expiring: "Lifetime" with no "Duration" (Rule 14).
        win = await payments.openCreateType();
        await win.fill({name: 'Lifetime', currency: 'USD', cost: '300', format: 'Online'});
        await win.saveAccepted();
        await expect.poll(() => payments.firstCells(types)).toEqual(['Old Rate', 'Other Rate', 'Online Year', 'Lifetime']);
        expect((await payments.rowCells(types, 'Lifetime'))[2]).toBe('Non-expiring');

        // "Edit": the kind greyed (Rule 15).
        win = await payments.openEditType('Online Year');
        await expect(win.kindRadio(TEXT.individual)).toBeDisabled();
        await expect(win.kindRadio(TEXT.institutional)).toBeDisabled();
        await win.close();

        // Institutional greys the membership box (Rule 15; Fields).
        win = await payments.openCreateType();
        await expect(win.membershipBox()).toBeEnabled();
        await win.kindRadio(TEXT.institutional).check();
        await expect(win.membershipBox()).toBeDisabled();

        // An unsaved change: the question, "OK", no "Draft" (Fields).
        await win.nameBox().fill('Draft');
        const asked = dialogs.messages.length;
        await win.close();
        expect(dialogs.messages.slice(asked)).toEqual([TEXT.formChanged]);
        await expect.poll(() => payments.firstCells(types)).toEqual(['Old Rate', 'Other Rate', 'Online Year', 'Lifetime']);

        // Deleting a type: Sam's PDF opens before; the question; "Old Rate"
        // and Sam's subscription gone; Sam's padlock after (Rule 16).
        const {page: sp} = await actorPage(asUser, sam);
        const S = readerSide(sp, tag);
        await openFromCurrent(S.reader, S.landing, 'Tidal Patterns');
        await expectOpens(sp, articleGalley(S.landing));
        const question = await payments.openQuestion(types, 'Old Rate', 'Delete', TEXT.deleteTypeQuestion);
        await payments.answer(question, 'OK', REQUEST.deleteType);
        await expect.poll(() => payments.firstCells(types)).toEqual(['Other Rate', 'Online Year', 'Lifetime']);
        await payments.showTab('Individual Subscriptions');
        await expect(payments.row('Individual Subscriptions', 'Tide')).toHaveCount(1);
        await expect(payments.row('Individual Subscriptions', 'Stone')).toHaveCount(0);
        await openFromCurrent(S.reader, S.landing, 'Tidal Patterns');
        await expectLocked(articleGalley(S.landing));

        // Control: Tess, of "Other Rate", still opens the PDF (Rules 16, 17).
        const {page: tp} = await actorPage(asUser, tess);
        const Ts = readerSide(tp, tag);
        await openFromCurrent(Ts.reader, Ts.landing, 'Tidal Patterns');
        await expectOpens(tp, articleGalley(Ts.landing));
    });

    test('S6: an individual subscription by hand: refused, saved, renewed and deleted', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.setTimeout(360_000);
        const tag = makeTag('s6', testInfo);
        const nova = `${tag}nova`;
        const sam = `${tag}sam`;
        const first = issue(1, 1, 2026, {published: true});
        const {manager, context} = await seedJournal(ojsApi, tag, {
            extra: [user(nova, 'Nova', 'Reed'), user(sam, 'Sam', 'Stone')],
            ...CONTACT,
            subscriptionTypes: [
                {name: 'Online Year', cost: 40, currency: 'USD', duration: 12},
                {name: 'Lifetime', cost: 300, currency: 'USD'},
            ],
            subscriptions: [{user: sam, type: 'Lifetime'}],
            issues: [first],
        });
        await article(ojsApi, tag, 'a', 'Tidal Patterns', first);
        const novaId = idOf(context, nova);
        const samId = idOf(context, sam);
        const {page: mg, dialogs} = await actorPage(asUser, manager);
        const payments = new PaymentsPage(mg, tag);
        const tab = 'Individual Subscriptions';
        const nextYear = months(12);

        // No user: "A user is required." (Rule 19).
        await payments.goto();
        const win = await payments.openCreateSubscription(tab);
        await win.chooseType('Online Year');
        await win.saveRefused(TEXT.userRequired);

        // No dates: both dates required (Rule 19).
        await win.chooseUser(nova, novaId);
        await win.chooseStatus('Active');
        await win.saveRefused(TEXT.startRequired);
        await expect(refusal(mg, win.dialog, TEXT.endRequired)).toBeVisible();

        // A user who has one (Rule 19). After the refusals the empty date
        // boxes show today's date that the form does not send, and typing
        // the same date changes nothing (T-ojs-2,
        // `.reports/U51/test-ojs-findings.md`): another day goes in first.
        await win.chooseUser(sam, samId);
        await retypeDate(win, 'dateStart', TODAY());
        await win.typeDate('dateEnd', nextYear);
        await win.saveRefused(TEXT.userHasOne);

        // Saved, with the email: the row reads name, email, type, status,
        // the dates and "INV-1" (Rule 19; Fields). The start date is typed
        // again (T-ojs-2).
        await win.chooseUser(nova, novaId);
        await retypeDate(win, 'dateStart', TODAY());
        await win.referenceBox().fill('INV-1');
        await win.emailBox().check();
        await win.saveAccepted();
        await expect(notice(mg, TEXT.saved).first()).toBeVisible();
        await expect
            .poll(() => payments.rowCells(tab, 'Reed'))
            .toEqual(['Nova Reed', mailOf(nova), 'Online Year', 'Active', TODAY(), nextYear, 'INV-1']);

        // The email: from the subscription contact, "Subscription
        // Notification", naming the journal, the type and Nova's username
        // (Side effects).
        const mail = await pkpMail.find({to: mailOf(nova), subject: 'Subscription Notification'});
        expect(mail.From).toMatchObject({Name: 'Subscriptions Desk', Address: 'desk@mail.test'});
        const body = flat((await pkpMail.fullMessage(mail.ID)).Text);
        expect(body).toContain(journalName(tag));
        expect(body).toContain('Online Year');
        expect(body).toContain(nova);

        // At once: Nova's PDF opens (Rules 17, 19).
        const {page: np} = await actorPage(asUser, nova);
        const N = readerSide(np, tag);
        await openFromCurrent(N.reader, N.landing, 'Tidal Patterns');
        await expectOpens(np, articleGalley(N.landing));

        // An unsaved change: "Edit" opens on Nova, filled in, the email box
        // unticked; the question on "Close"; the row keeps "INV-1" (Fields).
        let edit = await payments.openEditSubscription(tab, 'Reed');
        await expect(edit.userRadio(novaId)).toBeChecked();
        await expect(edit.referenceBox()).toHaveValue('INV-1');
        await expect(edit.emailBox()).not.toBeChecked();
        await edit.referenceBox().fill('INV-2');
        const asked = dialogs.messages.length;
        await edit.close();
        expect(dialogs.messages.slice(asked)).toEqual([TEXT.formChanged]);
        expect((await payments.rowCells(tab, 'Reed'))[6]).toBe('INV-1');

        // "Renew": the question; "End" a year on from the old end date,
        // "Active" kept (Rule 20).
        let question = await payments.openQuestion(tab, 'Reed', 'Renew', TEXT.renewQuestion);
        await payments.answer(question, 'OK');
        await expect.poll(async () => (await payments.rowCells(tab, 'Reed')).slice(3, 6)).toEqual(['Active', TODAY(), months(24)]);

        // Non-expiring: Sam's row has no dates and no "Renew" (Rule 20; Fields).
        expect((await payments.rowCells(tab, 'Stone')).slice(4, 6)).toEqual(['', '']);
        expect(await payments.rowActionNames(tab, 'Stone')).toEqual(['Edit', 'Delete']);
        expect(await payments.rowActionNames(tab, 'Reed')).toEqual(['Edit', 'Renew', 'Delete']);

        // "Delete": the question; the row gone; Nova's padlock (Rule 21).
        question = await payments.openQuestion(tab, 'Reed', 'Delete', TEXT.deleteQuestion);
        await payments.answer(question, 'OK', REQUEST.deleteSubscription);
        await expect(payments.row(tab, 'Stone')).toHaveCount(1);
        await expect(payments.row(tab, 'Reed')).toHaveCount(0);
        await openFromCurrent(N.reader, N.landing, 'Tidal Patterns');
        await expectLocked(articleGalley(N.landing));

        // Control: Nova holds that one email and nothing else. The bound is
        // a notification the manager sends Sam afterwards (A8).
        edit = await payments.openEditSubscription(tab, 'Stone');
        await edit.emailBox().check();
        await edit.saveAccepted();
        await pkpMail.find({to: mailOf(sam), subject: 'Subscription Notification'});
        expect(await pkpMail.count({to: mailOf(nova)})).toBe(1);
    });

    test('S7: an institutional subscription covers a visitor\'s address', async ({page, asUser, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s7', testInfo);
        const nova = `${tag}nova`;
        const first = issue(1, 1, 2026, {published: true});
        const {manager, context} = await seedJournal(ojsApi, tag, {
            extra: [user(nova, 'Nova', 'Reed')],
            sidebar: ['subscriptionblockplugin'],
            subscriptionTypes: [{name: 'Campus Year', cost: 400, currency: 'USD', duration: 12, format: 'online', institutional: true}],
            institutions: [{name: 'Harbour Library', ipRanges: ['127.0.0.1']}, {name: 'Dock Library'}],
            issues: [first],
        });
        await article(ojsApi, tag, 'a', 'Tidal Patterns', first);
        const {reader, landing, block} = readerSide(page, tag);
        const {page: mg} = await actorPage(asUser, manager);
        const payments = new PaymentsPage(mg, tag);
        const tab = 'Institutional Subscriptions';
        const nextYear = months(12);

        // Before: the padlock and the block's login line (Rules 10, 33).
        await openFromCurrent(reader, landing, 'Tidal Patterns');
        await expectLocked(articleGalley(landing));
        await expect(block.lines()).toHaveText([TEXT.blockLogin]);

        // No individual type: the window says so at once (Rule 19).
        await payments.goto();
        let win = await payments.openCreateSubscription('Individual Subscriptions');
        await expect(win.dialog).toContainText(TEXT.typeFirst);
        await win.close();

        // The institutional window's fields, and no "Membership" (Fields).
        await payments.showTab(tab);
        win = await payments.openCreateSubscription(tab);
        await expect(win.dialog).toContainText('Locate a User');
        expect((await win.typeOptions()).some((o) => o.startsWith('Campus Year - '))).toBe(true);
        await expect(win.statusSelect()).toBeVisible();
        await expect(win.dateBox('dateStart')).toBeVisible();
        await expect(win.dateBox('dateEnd')).toBeVisible();
        expect((await win.institutionSelect().locator('option').allInnerTexts()).map(flat).filter(Boolean)).toEqual(['Harbour Library', 'Dock Library']);
        await expect(win.mailingAddressBox()).toBeVisible();
        await expect(win.dialog).toContainText(/If a domain is entered here, IP ranges are optional\.\s*Valid values are domain names \(e\.g\. lib\.sfu\.ca\)\./);
        await expect(win.domainBox()).toHaveCount(1);
        await expect(win.membershipBox()).toHaveCount(0);
        await expect(win.referenceBox()).toBeVisible();
        await expect(win.dialog).toContainText('Notes');
        await expect(win.emailBox()).toBeAttached();

        // No domain and no IP range (Rule 19).
        await win.chooseUser(nova, idOf(context, nova));
        await win.chooseType('Campus Year');
        await win.chooseStatus('Active');
        await win.chooseInstitution('Dock Library');
        await win.typeDate('dateStart', TODAY());
        await win.typeDate('dateEnd', nextYear);
        await win.saveRefused(TEXT.needsDomainOrIp);

        // A malformed domain (Rule 19).
        await win.domainBox().fill('not a domain');
        await win.saveRefused(TEXT.badDomain);

        // Saved: the row reads the institution, type, status and dates (Rule 19).
        await win.domainBox().fill('');
        await win.chooseInstitution('Harbour Library');
        await win.saveAccepted();
        await expect(notice(mg, TEXT.saved).first()).toBeVisible();
        await expect
            .poll(async () => (await payments.rowCells(tab, 'Harbour Library')).slice(0, 5))
            .toEqual(['Harbour Library', 'Campus Year', 'Active', TODAY(), nextYear]);

        // The visitor, still signed out: no padlock, the PDF opens; the block
        // names the institution and the address (Rules 11, 18, 33).
        await landing.reload();
        await expectUnlocked(articleGalley(landing), GLYPH.pdf);
        await expect(block.lines()).toHaveText([TEXT.providedBy('Harbour Library'), TEXT.accessedFrom('127.0.0.1')]);
        await expectOpens(page, articleGalley(landing));

        // Control: "Needs Information" closes it again (Rules 18, 33).
        const edit = await payments.openEditSubscription(tab, 'Harbour Library');
        await edit.chooseStatus('Needs Information');
        await edit.saveAccepted();
        await openFromCurrent(reader, landing, 'Tidal Patterns');
        await expectLocked(articleGalley(landing));
        await expect(block.lines()).toHaveText([TEXT.blockLogin]);
    });

    test('S8: the "Subscriptions" page and the subscription policies', async ({page, asUser, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s8', testInfo);
        const plain = `${tag}p`;
        const rd = `${tag}rd`;
        const {manager} = await seedJournal(ojsApi, tag, {
            extra: [user(rd, 'Rhea', 'Reader')],
            payments: PAY,
            subscriptionTypes: [
                {name: 'Online Year', cost: 40, currency: 'USD', duration: 12, description: '<p>A year of online reading.</p>'},
                {name: 'Staff Rate', cost: 1, currency: 'USD', duration: 12, hidden: true},
                {name: 'Campus Year', cost: 400, currency: 'USD', duration: 12, institutional: true},
            ],
        });
        // Scenario 1's journal for the control: payments not set up.
        await ojsApi.createContext({tag: plain, publishingMode: 'subscription', users: [user(`${plain}mg`, 'Mona', 'Manager', ['manager'])]});
        const {page: mg} = await actorPage(asUser, manager);
        const payments = new PaymentsPage(mg, tag);
        let saves = 0;
        mg.on('request', (r) => {
            if (REQUEST.savePolicies.test(r.url()) && r.method() === 'POST') saves++;
        });

        // The policies refused: "This field is required." under "Name",
        // "Email" and "Mailing Address", nothing sent (Rule 24; Fields).
        await payments.gotoTab('Subscription Policies');
        const policies = payments.policies();
        await expect(policies.nameBox()).toHaveValue('');
        await policies.saveButton().click();
        await expect(await policies.errorUnder(policies.nameBox())).toHaveText(TEXT.fieldRequired);
        await expect(await policies.errorUnder(policies.emailBox())).toHaveText(TEXT.fieldRequired);
        await expect(await policies.errorUnder(policies.addressBox())).toHaveText(TEXT.fieldRequired);

        // A malformed email (Fields).
        await policies.nameBox().fill('Subscriptions Desk');
        await policies.emailBox().fill('desk@');
        await policies.addressBox().fill('1 Harbour Road');
        await policies.saveButton().click();
        await expect(await policies.errorUnder(policies.emailBox())).toHaveText(TEXT.badEmail);

        // Saved: "Your changes have been saved."; the four payment boxes can
        // be ticked (Rules 24, 25). The two refusals sent nothing: this save
        // is the tab's only request.
        await policies.emailBox().fill('desk@mail.test');
        await policies.phoneBox().fill('+1 555 0100');
        await policies.typeInformation('Subscriptions renew each January.');
        const saved = await policies.save();
        expect(saved.ok()).toBe(true);
        await expect(notice(mg, TEXT.saved).first()).toBeVisible();
        expect(saves).toBe(1);
        for (const box of policies.paymentBoxes()) await expect(box).toBeEnabled();

        // The visitor's "Subscriptions" page: breadcrumb, heading,
        // information, contact (Rule 26; Fields).
        const subs = new SubscriptionsReader(page, tag);
        await subs.goto();
        await subs.expectOpen();
        await expect(subs.breadcrumb()).toHaveText(/^\s*Home\s*\/\s*Subscriptions\s*$/);
        await expect(subs.information()).toHaveText('Subscriptions renew each January.');
        await expect(subs.contact().locator('h3')).toHaveText('Subscriptions Contact');
        await expect(subs.contactLine('name')).toHaveText('Subscriptions Desk');
        await expect(subs.contactLine('address')).toHaveText('1 Harbour Road');
        await expect(subs.contactLine('phone')).toHaveText(/^\s*Phone\s+\+1 555 0100\s*$/);
        const email = subs.contactLine('email').getByRole('link', {name: 'desk@mail.test', exact: true});
        await expect(email).toHaveAttribute('href', 'mailto:desk@mail.test');

        // The types listed: "Online Year" with its description, no "Staff
        // Rate"; "Campus Year"; no "Purchase New Subscription" for the
        // visitor (Rules 16a, 26).
        await expect(subs.partDescription('Individual Subscriptions')).toHaveText(TEXT.individualDescription);
        await expect(subs.columns('Individual Subscriptions')).toHaveText(['Name', 'Format', 'Duration', 'Cost']);
        await expect(subs.typeNames('Individual Subscriptions')).toHaveText(['Online Year']);
        await expect(subs.typeRow('Individual Subscriptions', 'Online Year').locator('.subscription_description')).toHaveText('A year of online reading.');
        await expect(subs.partDescription('Institutional Subscriptions')).toHaveText(TEXT.institutionalDescription);
        await expect(subs.typeNames('Institutional Subscriptions')).toHaveText(['Campus Year']);
        await expect(subs.purchaseLinks()).toHaveCount(0);

        // The Reader: "Purchase New Subscription" under each table (Fields).
        const {page: rp} = await actorPage(asUser, rd);
        const rsubs = new SubscriptionsReader(rp, tag);
        await rsubs.goto();
        await rsubs.expectOpen();
        await expect(rsubs.purchaseLinks()).toHaveCount(2);
        await expect(rp.locator('.subscriptions_individual_purchase').getByRole('link', {name: TEXT.purchaseNew, exact: true})).toBeVisible();
        await expect(rp.locator('.subscriptions_institutional_purchase').getByRole('link', {name: TEXT.purchaseNew, exact: true})).toBeVisible();

        // The hidden type in the window (Rule 16a).
        await payments.goto();
        const win = await payments.openCreateSubscription('Individual Subscriptions');
        const options = await win.typeOptions();
        expect(options.some((o) => o.startsWith('Online Year - '))).toBe(true);
        expect(options.some((o) => o.startsWith('Staff Rate - '))).toBe(true);
        await win.close();

        // Control: without payments set up the address leads home (Rule 26).
        const plainSubs = new SubscriptionsReader(page, plain);
        await plainSubs.goto();
        await plainSubs.expectHome();
    });

    test('S9: a reader buys an individual subscription', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s9', testInfo);
        const nova = `${tag}nova`;
        const office = mailOf(`${tag}pc`);
        const first = issue(1, 1, 2026, {published: true});
        const {manager} = await seedJournal(ojsApi, tag, {
            context: {contactName: 'Journal Office', contactEmail: office},
            extra: [user(nova, 'Nova', 'Reed')],
            payments: PAY,
            sidebar: ['subscriptionblockplugin'],
            subscriptionTypes: [{name: 'Online Year', cost: 40, currency: 'USD', duration: 12}],
            issues: [first],
        });
        await article(ojsApi, tag, 'a', 'Tidal Patterns', first);
        const {page: np} = await actorPage(asUser, nova);
        const N = readerSide(np, tag);
        const my = new MySubscriptionsPage(np, tag);
        const nextYear = months(12);

        // "My Subscriptions": the heading, the status table, "Individual
        // Subscription" with "Purchase New Subscription" (Rule 27; Fields).
        await my.goto();
        await my.expectOpen();
        await expect(my.statusPart().locator('h3')).toHaveText('Subscription Status');
        expect((await my.statusRows()).map((r) => r[0])).toEqual(['Status', ...TEXT.statusRows]);
        await expect(my.individualPart().locator('h3')).toHaveText('Individual Subscription');
        await expect(my.rows(my.individualPart())).toHaveCount(0);

        // The purchase page: its tab title, no heading, the box (Rule 28; Fields).
        await my.purchaseLink(my.individualPart()).click();
        const purchase = new PurchasePage(np, tag);
        await expect(np).toHaveTitle(new RegExp(`^${TEXT.purchaseIndividualTitle} \\|`));
        await expect(purchase.form()).toBeVisible();
        await expect(purchase.main().locator('h1')).toHaveCount(0);
        await expect(purchase.legend()).toHaveText(TEXT.purchaseLegend);
        expect(await purchase.typeOptions()).toEqual(['Online Year (40.00 USD)']);
        await expect(purchase.membershipBox()).toBeVisible();
        await purchase.typeSelect().selectOption({label: 'Online Year (40.00 USD)'});
        await purchase.submit();

        // The payment page: the item, the fee, the instructions and "Send
        // notification of payment" (Rules 28, 30).
        const payment = new ManualPaymentPage(np, tag);
        await payment.expectOpen();
        await expect(payment.value('Title')).toHaveText(TEXT.subscriptionFee('Online Year'));
        await expect(payment.value('Fee')).toHaveText('40.00 (USD)');
        await expect(payment.instructions()).toHaveText('Pay by bank transfer.');
        await expect(payment.notifyLink()).toBeVisible();

        // Awaiting payment: the status, no button; the padlock stays (Rules 17, 27, 31).
        await my.goto();
        await expect(my.rows(my.individualPart())).toHaveCount(1);
        const row = my.rows(my.individualPart()).first();
        expect((await my.rowCells(row)).slice(0, 2)).toEqual(['Online Year', TEXT.awaitingManual]);
        await expect(my.rowButtons(row)).toHaveCount(0);
        await openFromCurrent(N.reader, N.landing, 'Tidal Patterns');
        await expectLocked(articleGalley(N.landing));

        // The manager's list: "Awaiting Manual Payment", today twice; "Edit"
        // to "Active" with next year's end date (Rules 28, 30).
        const {page: mg} = await actorPage(asUser, manager);
        const payments = new PaymentsPage(mg, tag);
        await payments.goto();
        expect((await payments.rowCells('Individual Subscriptions', 'Reed')).slice(2, 6)).toEqual(['Online Year', TEXT.awaitingManual, TODAY(), TODAY()]);
        const edit = await payments.openEditSubscription('Individual Subscriptions', 'Reed');
        await edit.chooseStatus('Active');
        await edit.typeDate('dateEnd', nextYear);
        await edit.saveAccepted();

        // Active: "Expires:", "Renew" and "Purchase"; the PDF opens; the
        // block (Rules 17, 27, 31, 33).
        await my.goto();
        expect((await my.rowCells(my.rows(my.individualPart()).first())).slice(0, 2)).toEqual(['Online Year', TEXT.expires(nextYear)]);
        await expect(my.rowButtons(my.rows(my.individualPart()).first())).toHaveText(['Renew', 'Purchase']);
        await openFromCurrent(N.reader, N.landing, 'Tidal Patterns');
        await expect(N.block.lines()).toHaveText(['Online Year', TEXT.expires(nextYear), TEXT.mySubscriptions]);
        await expectOpens(np, articleGalley(N.landing));

        // Control: no email to Nova. The bound is the payment notification
        // Nova sends the journal's contact afterwards, from "Renew"'s
        // payment page (A8).
        await my.goto();
        await my.rowButtons(my.rows(my.individualPart()).first()).filter({hasText: 'Renew'}).click();
        await payment.expectOpen();
        await payment.notifyLink().click();
        await pkpMail.find({to: office});
        expect(await pkpMail.count({to: mailOf(nova)})).toBe(0);
    });

    test('S10: a reader buys an institutional subscription', async ({asUser, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s10', testInfo);
        const nova = `${tag}nova`;
        const {manager} = await seedJournal(ojsApi, tag, {
            extra: [user(nova, 'Nova', 'Reed')],
            payments: PAY,
            subscriptionTypes: [{name: 'Campus Year', cost: 400, currency: 'USD', duration: 12, format: 'online', institutional: true}],
        });
        const {page: np} = await actorPage(asUser, nova);
        const my = new MySubscriptionsPage(np, tag);
        const purchase = new PurchasePage(np, tag);

        // "My Subscriptions": "Purchase New Subscription" under
        // "Institutional Subscriptions" (Fields).
        await my.goto();
        await my.expectOpen();
        await expect(my.institutionalPart().locator('h3')).toHaveText('Institutional Subscriptions');
        await expect(my.rows(my.institutionalPart())).toHaveCount(0);

        // The purchase page (Rule 29; Fields).
        await my.purchaseLink(my.institutionalPart()).click();
        await expect(purchase.heading()).toHaveText(TEXT.purchaseInstitutionalTitle);
        await expect(purchase.legend()).toHaveText(TEXT.purchaseLegend);
        await expect(purchase.selectedType()).toHaveText(/^\s*Campus Year\b/);
        for (const box of [purchase.membershipBox(), purchase.institutionNameBox(), purchase.mailingAddressBox(), purchase.domainBox(), purchase.ipRangesBox()]) {
            await expect(box).toBeVisible();
        }
        await expect(purchase.submitButton()).toHaveText('Continue');
        await expect(purchase.cancelLink()).toBeVisible();

        // "Cancel": "My Subscriptions" is back (Rule 29).
        await purchase.institutionNameBox().fill('Harbour Library');
        await purchase.cancelLink().click();
        await my.expectOpen();

        // Refused, empty (Rule 29).
        await my.purchaseLink(my.institutionalPart()).click();
        await purchase.submit();
        await expect(purchase.errors()).toContainText(TEXT.institutionNameRequired);
        await expect(purchase.errors()).toContainText(TEXT.needsDomainOrIp);

        // A malformed range, then a malformed domain (Rule 29).
        await purchase.institutionNameBox().fill('Harbour Library');
        await purchase.ipRangesBox().fill('999.1.1.1');
        await purchase.submit();
        await expect(purchase.errors()).toContainText(TEXT.badIpRange);
        await purchase.ipRangesBox().fill('142.58.103.1');
        await purchase.domainBox().fill('not a domain');
        await purchase.submit();
        await expect(purchase.errors()).toContainText(TEXT.badDomain);

        // Accepted: the payment page for "Campus Year" (Rules 28, 29, 30).
        await purchase.domainBox().fill('');
        await purchase.submit();
        const payment = new ManualPaymentPage(np, tag);
        await payment.expectOpen();
        await expect(payment.value('Title')).toHaveText(TEXT.subscriptionFee('Campus Year'));
        await expect(payment.value('Fee')).toHaveText('400.00 (USD)');

        // Nova's page: the institutional row (Rule 27).
        await my.goto();
        await expect(my.rows(my.institutionalPart())).toHaveCount(1);
        expect((await my.rowCells(my.rows(my.institutionalPart()).first())).slice(0, 3)).toEqual(['Campus Year', 'Harbour Library', TEXT.awaitingManual]);

        // The manager's side: the list, and "Institutions" listing "Harbour
        // Library" once, the cancelled page adding none (Rule 29; Side effects).
        const {page: mg} = await actorPage(asUser, manager);
        const payments = new PaymentsPage(mg, tag);
        await payments.gotoTab('Institutional Subscriptions');
        expect((await payments.rowCells('Institutional Subscriptions', 'Harbour Library')).slice(0, 3)).toEqual(['Harbour Library', 'Campus Year', TEXT.awaitingManual]);
        await new EditorialSideMenu(mg).entry('Institutions').click();
        await expect(mg).toHaveURL(/\/management\/settings\/institutions$/);
        await expect(new InstitutionsPage(mg, tag).names()).toHaveText(['Harbour Library']);
    });

    test('S11: "Partial expiry"', async ({asUser, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s11', testInfo);
        const eve = `${tag}eve`;
        const sam = `${tag}sam`;
        const name = 'Vol. 1 No. 1 (2025)';
        const first = issue(1, 1, 2025, {published: true, datePublished: '2025-03-01', galleys: PDF});
        const {manager} = await seedJournal(ojsApi, tag, {
            extra: [user(eve, 'Eve', 'Ember'), user(sam, 'Sam', 'Stone')],
            ...CONTACT,
            subscriptionExpiryPartial: true,
            subscriptionTypes: [{name: 'Online Year', cost: 40, currency: 'USD', duration: 12}],
            subscriptions: [{user: eve, type: 'Online Year', dateStart: '2025-01-01', dateEnd: days(-30)}, {user: sam, type: 'Online Year'}],
            issues: [first],
        });
        await article(ojsApi, tag, 'a', 'Tidal Patterns', first);
        const {page: ep} = await actorPage(asUser, eve);
        const E = readerSide(ep, tag);

        // Partial expiry: the "Full Issue" opens, the later article does not (Rule 23).
        await E.reader.gotoHome();
        await E.reader.pressHeader('Current');
        await expect(E.reader.heading()).toHaveText(name);
        await expectOpens(ep, fullIssueGalley(E.reader), ISSUE_GALLEY);
        await openFromCurrent(E.reader, E.landing, 'Tidal Patterns');
        await expectNotOpened(ep, articleGalley(E.landing));

        // Full expiry: saved; the "Full Issue" no longer opens (Rules 23, 24).
        const {page: mg} = await actorPage(asUser, manager);
        const payments = new PaymentsPage(mg, tag);
        await payments.gotoTab('Subscription Policies');
        const policies = payments.policies();
        await expect(policies.expiryRadio('Partial expiry')).toBeChecked();
        await policies.expiryRadio('Full expiry').check();
        const saved = await policies.save();
        expect(saved.ok()).toBe(true);
        await expect(notice(mg, TEXT.saved).first()).toBeVisible();
        await E.reader.gotoHome();
        await E.reader.pressHeader('Current');
        await expectNotOpened(ep, fullIssueGalley(E.reader));

        // Control: Sam opens both (Rule 17).
        const {page: sp} = await actorPage(asUser, sam);
        const S = readerSide(sp, tag);
        await S.reader.gotoHome();
        await S.reader.pressHeader('Current');
        await expectOpens(sp, fullIssueGalley(S.reader), ISSUE_GALLEY);
        await openFromCurrent(S.reader, S.landing, 'Tidal Patterns');
        await expectOpens(sp, articleGalley(S.landing));
    });

    test('S13: "Delayed Open Access"', async ({asUser, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s13', testInfo);
        const rd = `${tag}rd`;
        const first = issue(1, 1, 2026, {published: true, accessStatus: 'open'});
        const second = issue(1, 2, 2026);
        const {manager} = await seedJournal(ojsApi, tag, {extra: [user(rd, 'Rhea', 'Reader')], issues: [first, second]});
        await article(ojsApi, tag, 'a', 'Tidal Patterns', first);
        await article(ojsApi, tag, 'b', 'Coastal Winds', second);
        const {page: mg} = await actorPage(asUser, manager);

        // The list: "6 Months", "Saved" (Rules 5, 6).
        const access = new AccessSettings(mg, tag);
        await access.goto();
        await access.delayedList().selectOption({label: '6 Months'});
        await access.save();

        // Published under it: "Subscription", the open access date six
        // months on (Rule 6).
        const issues = new IssuesAdmin(mg, tag);
        await issues.goto('Future Issues');
        const publish = await issues.openPublish('Vol. 1 No. 2 (2026)');
        await publish.mailBox().uncheck();
        await publish.ok();
        await issues.goto('Back Issues');
        let win = await issues.openManagement('Back Issues', 'Vol. 1 No. 2 (2026)');
        let form = await win.openAccess();
        await expect(form.locator('select#accessStatus option:checked')).toHaveText('Subscription');
        await expect(form.locator('input[name="openAccessDate-removed"]')).toHaveValue(months(6));
        await win.close();

        // Control: the issue published before keeps "Open access" (Rule 6).
        win = await issues.openManagement('Back Issues', ISSUE);
        form = await win.openAccess();
        await expect(form.locator('select#accessStatus option:checked')).toHaveText('Open access');
        await win.close();

        // The reader side: "Coastal Winds" locked; "Tidal Patterns" opens (Rules 6, 7).
        const {page: rp} = await actorPage(asUser, rd);
        const R = readerSide(rp, tag);
        await openFromArchives(R.reader, 'Vol. 1 No. 2 (2026)');
        await R.reader.articleLink('Coastal Winds').click();
        await expect(R.landing.title()).toHaveText('Coastal Winds');
        await expectLocked(articleGalley(R.landing));
        await openFromArchives(R.reader, ISSUE);
        await R.reader.articleLink('Tidal Patterns').click();
        await expect(R.landing.title()).toHaveText('Tidal Patterns');
        await expectOpens(rp, articleGalley(R.landing));
    });

    test('S14: a "Purchase Article" fee, and "Only Restrict Access to PDF…"', async ({page, asUser, ojsApi}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s14', testInfo);
        const rd = `${tag}rd`;
        const first = issue(1, 1, 2026, {published: true});
        const {manager} = await seedJournal(ojsApi, tag, {
            extra: [user(rd, 'Rhea', 'Reader')],
            payments: {...PAY, purchaseArticleFee: 5},
            issues: [first],
        });
        await article(ojsApi, tag, 'a', 'Tidal Patterns', first, {galleys: [...PDF, {label: 'HTML', file: 'article.html'}]});
        const {reader, landing} = readerSide(page, tag);

        // The price on the link: both locked, "(USD 5)", "Requires
        // Subscription or Fee" (Rule 10; Settings bullet 5).
        await openFromCurrent(reader, landing, 'Tidal Patterns');
        for (const label of ['PDF', 'HTML']) {
            await expectLocked(articleGalley(landing, label), TEXT.requiresSubscriptionOrFee);
            await expect(feeWords(articleGalley(landing, label))).toHaveText('(USD 5)');
        }

        // Signed out: the Login page with the purchase message (Rule 12).
        await expectLoginWith(page, articleGalley(landing), TEXT.loginPurchaseArticle);

        // Signed in: the payment page for a "Purchase Article Fee" of 5 (Rules 12, 30).
        const {page: rp} = await actorPage(asUser, rd);
        const R = readerSide(rp, tag);
        await openFromCurrent(R.reader, R.landing, 'Tidal Patterns');
        await articleGalley(R.landing).click();
        const payment = new ManualPaymentPage(rp, tag);
        await payment.expectOpen();
        await expect(payment.value('Title')).toHaveText(TEXT.purchaseArticleFee);
        await expect(payment.value('Fee')).toHaveText('5.00 (USD)');

        // Only PDF restricted: "PDF" locked, "HTML" not, and it opens
        // (Rule 10; Settings bullet 6).
        const {page: mg} = await actorPage(asUser, manager);
        const payments = new PaymentsPage(mg, tag);
        await payments.gotoTab('Payment Types');
        const types = payments.paymentTypes();
        await expect(types.restrictOnlyPdfBox()).not.toBeChecked();
        await types.restrictOnlyPdfBox().check();
        const saved = await types.save();
        expect(saved.ok()).toBe(true);
        await openFromCurrent(reader, landing, 'Tidal Patterns');
        await expectLocked(articleGalley(landing, 'PDF'), TEXT.requiresSubscriptionOrFee);
        await expectUnlocked(articleGalley(landing, 'HTML'));
        await expect(lockWords(articleGalley(landing, 'HTML'))).toHaveCount(0);
        await expectOpens(page, articleGalley(landing, 'HTML'));

        // Control: "PDF" still opens the Login page with the same message (Rule 12).
        await openFromCurrent(reader, landing, 'Tidal Patterns');
        await expectLoginWith(page, articleGalley(landing), TEXT.loginPurchaseArticle);
    });

    test('S15: registered readers only, on a journal that requires subscriptions', async ({page, asUser, ojsApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s15', testInfo);
        const rd = `${tag}rd`;
        const first = issue(1, 1, 2026, {published: true});
        await seedJournal(ojsApi, tag, {extra: [user(rd, 'Rhea', 'Reader')], restrictArticleAccess: true, issues: [first]});
        await article(ojsApi, tag, 'a', 'Tidal Patterns', first);
        await article(ojsApi, tag, 'b', 'Open Waters', first, {accessStatus: 'open'});
        const {reader, landing} = readerSide(page, tag);

        // Signed out: "Open Waters"'s page opens; both "PDF" links open the
        // Login page (Rule 13).
        await openFromCurrent(reader, landing, 'Open Waters');
        await articleGalley(landing).click();
        await expect(page).toHaveURL(/\/login\?/);
        await expect(page.locator('input#username')).toBeVisible();
        await openFromCurrent(reader, landing, 'Tidal Patterns');
        await articleGalley(landing).click();
        await expect(page).toHaveURL(/\/login\?/);
        await expect(page.locator('input#username')).toBeVisible();

        // Signed in: "Open Waters"'s PDF opens (Rules 7, 13).
        const {page: rp} = await actorPage(asUser, rd);
        const R = readerSide(rp, tag);
        await openFromCurrent(R.reader, R.landing, 'Open Waters');
        await expectOpens(rp, articleGalley(R.landing));

        // Control: "Tidal Patterns"'s "PDF" shows the padlock (Rules 7, 10).
        await openFromCurrent(R.reader, R.landing, 'Tidal Patterns');
        await expectLocked(articleGalley(R.landing));
    });
});
