// @ts-check
/**
 * @file playwright/tests/serial/U01-login-and-sessions.spec.js
 *
 * U01 — Login & sessions, OMP suite, the Confirm Access gate: S10
 * (Confirm Access before Administration, and a page left open past the
 * window). Scenarios 1–9, the register IDs left out and the suite's
 * coverage boundaries are in `../U01-login-and-sessions.spec.js`.
 * Spec: docs/specs/U01-login-and-sessions.md
 *
 * Runs on the reauth-variant server (`variants.reauth`, base port + 91,
 * `[security] password_timeout = 1`, the fleet's DB, files dir and
 * Mailpit; harness.md "The reauth-variant server", PRINCIPLES D9). The
 * Site Administrator signs in through the variant's own site-level Login
 * page, in a browser context whose `baseURL` is the variant, so the shared
 * Administration page objects' relative addresses reach it; the scratch
 * press is seeded through the worker's server (`ompApi`, the DB being
 * shared; spec fn-s).
 *
 * `@solo`, on purpose: the window is wall time, so the test waits it out
 * (65 s after the last Administration request, a one-minute window plus a
 * margin), and the "Your last action was not completed" notice is the
 * Site Administrator's trivial notification, which lib/pkp's
 * `NotificationHandler::fetchNotification` hands to whichever `admin`
 * page asks first (patterns.md parallel lesson 2): several parallel and
 * serial tests sign in as `admin`, and only `admin` meets the gate. The
 * refusals change nothing (Rule 16), and the Control reads that they did
 * not; should a save go through, the `finally` puts "Minimum password
 * length" back to the install's 6 through `PUT index/api/v1/site` on the
 * worker's server (spec fn-s), and "Delete Template Cache" pressed past
 * the window is never replayed, so no site-wide cache is cleared.
 */
const {test, expect} = require('../../support/fixtures.js');
const {SiteSettingsPage, putSite} = require('../../../../../shared/playwright/pages/SiteSettingsPages.js');
const {HostedJournalsPage, SiteJournalsList} = require('../../../../../shared/playwright/pages/HostedJournalsPages.js');
const {
    AdministrationPage,
    ConfirmAccessPage,
    CONFIRM_ACCESS_EXPIRED,
    LAST_ACTION_INCOMPLETE,
    adminNotice,
    waitPastWindow,
} = require('../../../../../shared/playwright/pages/AdminPages.js');
const {disableMotion} = require('../../../../../shared/playwright/support/motion.js');
const {siteLoginUrl} = require('../../pages/LoginSessionsPages.js');

const ADMIN = {username: 'admin', password: 'admin', fullName: 'admin admin'};
const GENERIC_ERROR = 'Invalid username/email or password. Please try again.';
const LABELS = {hosted: 'Hosted Presses', table: 'Presses', create: 'Create Press'};
/** "Minimum password length (characters)" on every test install (spec fn-s). */
const INSTALL_MIN_LENGTH = '6';
/** The variant's confirmation window, one minute (harness.md), plus a margin. */
const PAST_THE_WINDOW_MS = 65_000;

/** Parallel-safe unique tag: single alphanumeric token, ≤32 chars. */
function makeTag(testInfo, scenarioKey) {
    const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6);
    return `${scenarioKey}ompw${testInfo.parallelIndex}${rand}`;
}

/** The interrupted page's address, as the gate carries it in `source`. */
const adminPath = (rest) => `/index.php/index/en/admin${rest}`;

/** Fill and submit the Login form the page shows (the password box's maxlength lifted, A1). */
async function submitLoginForm(page, username, password) {
    await page.locator('input#username').fill(username);
    const passwordInput = page.locator('input#password');
    await passwordInput.evaluate((el) => el.removeAttribute('maxlength'));
    await passwordInput.fill(password);
    await page.locator('form#login button[type="submit"]').click();
}

/**
 * The "Confirm Access" form on `page`, for the signed-in administrator;
 * with `source`, the address bar carries that interrupted page.
 */
async function expectGate(page, source) {
    const gate = new ConfirmAccessPage(page);
    await gate.expectForm(ADMIN.fullName);
    const address = gate.gateAddress();
    // After a wrong password the form is redrawn at its submit address.
    expect(address.pathname).toMatch(/\/admin\/confirmAccess(Submit)?$/);
    if (source) {
        expect(address.source).toBe(source);
    }
    return gate;
}

test.describe('Login & sessions (U1), the Confirm Access gate', () => {
    test('S10: Confirm Access before Administration, and a page left open past the window @solo', async ({
        ompApi,
        asUser,
        browser,
        variants,
    }, testInfo) => {
        testInfo.setTimeout(5 * 60_000);
        // Given: a scratch press hosted beside the seeded one (spec fn-s).
        const tag = makeTag(testInfo, 'u1s10');
        await ompApi.createContext({tag});
        const pressName = `Scratch context ${tag}`;

        // The Site Administrator, signed in through the variant's own Login page.
        const context = await browser.newContext({
            baseURL: variants.reauth,
            storageState: {cookies: [], origins: []},
            reducedMotion: 'reduce',
        });
        await disableMotion(context);
        let saveWentThrough = false;
        try {
            const page = await context.newPage();
            await page.goto(siteLoginUrl());
            await submitLoginForm(page, ADMIN.username, ADMIN.password);
            await page.waitForURL((url) => !url.pathname.includes('/login'), {timeout: 30_000, waitUntil: 'commit'});

            // Administration, not yet confirmed: Hosted Presses shows the
            // "Confirm Access" form instead, the interrupted page in the
            // address bar (Rule 16).
            await page.goto(adminPath('/contexts'));
            const gate = await expectGate(page, adminPath('/contexts'));
            await expect(page.locator('#contextGridContainer')).toHaveCount(0);

            // The Confirm Access address alone, not yet confirmed: sent
            // straight home, no form, no password asked, not into
            // Administration. With a scratch press enabled beside the seeded
            // one, home is the site's homepage, the presses' list.
            await gate.gotoTrimmed();
            await expect(page).toHaveURL(/\/index\.php\/index\/en\/index$/);
            const siteHome = new SiteJournalsList(page, {table: 'Presses'});
            await expect(siteHome.nameLink(pressName)).toBeVisible({timeout: 30_000});
            await expect(siteHome.nameLink('Public Knowledge Press')).toBeVisible();
            await expect(gate.form).toHaveCount(0);
            await expect(page.locator('input[type="password"]')).toHaveCount(0);
            await expect(page).not.toHaveURL(/\/admin/);

            // A wrong password: the form again, with the generic sign-in error.
            await page.goto(adminPath('/contexts'));
            await expectGate(page, adminPath('/contexts'));
            await gate.submit('not-the-password');
            await expectGate(page);
            // The error is a top-right page notice over the form.
            await expect(adminNotice(page, GENERIC_ERROR)).toBeVisible();
            await expect(page.locator('#contextGridContainer')).toHaveCount(0);

            // The correct password: Administration opens on the interrupted
            // page, Hosted Presses, listing the scratch press, no password asked.
            await gate.submit(ADMIN.password);
            await expect(page).toHaveURL(new RegExp(`${adminPath('/contexts')}$`));
            const hosted = new HostedJournalsPage(page, LABELS);
            await hosted.expectOpen();
            await expect(hosted.row(tag)).toHaveCount(1);
            await expect(gate.form).toHaveCount(0);

            // Moving between screens inside the window: a second tab on Site
            // Settings › "Site Setup" › "Security", no password asked; the
            // minimum length reads 6.
            const securityTab = await context.newPage();
            const site = new SiteSettingsPage(securityTab);
            await site.goto();
            await expect(securityTab).toHaveURL(/\/admin\/settings/);
            const security = await site.security();
            await expect(security.minPasswordLength).toHaveValue(INSTALL_MIN_LENGTH);
            await expect(new ConfirmAccessPage(securityTab).form).toHaveCount(0);

            // The Confirm Access address alone, inside the window, in a third
            // tab: Administration opens instead of the form.
            const adminTab = await context.newPage();
            const adminGate = new ConfirmAccessPage(adminTab);
            await adminGate.gotoTrimmed();
            const administration = new AdministrationPage(adminTab);
            await administration.expectOpen();
            await expect(adminTab).toHaveURL(new RegExp(`${adminPath('')}$`));
            await expect(adminGate.form).toHaveCount(0);
            // The last Administration request of the window.
            const windowLastRenewed = Date.now();

            // Pages left open past the window: the three tabs untouched.
            await waitPastWindow(adminTab, windowLastRenewed, PAST_THE_WINDOW_MS);

            // On the Security tab, 12 and "Save": refused with the expired line.
            await security.minPasswordLength.fill('12');
            const saved = await security.pressSave();
            saveWentThrough = saved.ok();
            expect(saved.ok(), `the Security save is refused (answered ${saved.status()})`).toBe(false);
            await expect(adminNotice(securityTab, CONFIRM_ACCESS_EXPIRED)).toBeVisible();

            // On the Hosted Presses tab, the scratch press's "Remove", "OK"
            // in "Confirm": the same answer, in the browser's own box.
            const remove = await hosted.openRemove(tag);
            const alerts = [];
            page.once('dialog', (dialog) => {
                alerts.push(dialog.message());
                dialog.accept().catch(() => {});
            });
            const removed = page.waitForResponse(
                (r) => r.request().method() === 'POST' && /delete-context/.test(r.url()),
                {timeout: 30_000}
            );
            await remove.button('OK').click();
            expect((await removed).status(), 'the removal answers').toBeLessThan(500);
            await expect.poll(() => alerts, {timeout: 30_000}).toEqual([CONFIRM_ACCESS_EXPIRED]);
            // Once the box is answered the "Confirm" window stays open over
            // the list (T-omp-1, returned to the fold; the spec says nothing
            // of it): closed the way a person would, "Cancel".
            if (await remove.root.isVisible()) {
                await remove.answer('Cancel');
            }
            await expect(hosted.row(tag)).toHaveCount(1);

            // Reloading the Security tab: the "Confirm Access" form.
            await securityTab.reload();
            const securityGate = await expectGate(securityTab, adminPath('/settings'));

            // A button that reloads the page: "Delete Template Cache", "OK":
            // the "Confirm Access" form; the password: Administration with
            // the notice that the press was not replayed.
            const pressed = await administration.press('Delete Template Cache');
            expect(pressed.dialogs).toHaveLength(1);
            await expectGate(adminTab);
            expect(adminGate.gateAddress().isActionRequest).toBeTruthy();
            await adminGate.submit(ADMIN.password);
            await administration.expectOpen();
            await expect(adminNotice(adminTab, LAST_ACTION_INCOMPLETE)).toBeVisible({timeout: 30_000});

            // Control: the Security tab reloaded, no password asked (the new
            // window open), "Minimum password length" still 6; the Hosted
            // Presses tab reloaded, the scratch press still listed. The
            // refused changes changed nothing (Rule 16).
            // The tab holds the Confirm Access address since the reload above,
            // which sends a confirmed administrator to Administration whatever
            // page it carries (T-omp-2, returned to the fold): no password
            // asked, Administration, then "Site Settings" from its link.
            await securityTab.reload();
            await new AdministrationPage(securityTab).expectOpen();
            await expect(securityGate.form).toHaveCount(0);
            await securityTab.getByRole('main').getByRole('link', {name: 'Site Settings', exact: true}).click();
            await securityTab.waitForURL(/\/admin\/settings/, {timeout: 30_000, waitUntil: 'commit'});
            await site.expectOpen();
            await expect(securityGate.form).toHaveCount(0);
            const securityAgain = await site.security();
            await expect(securityAgain.minPasswordLength).toHaveValue(INSTALL_MIN_LENGTH);
            await hosted.reload();
            await expect(hosted.row(tag)).toHaveCount(1);
            await expect(gate.form).toHaveCount(0);
        } finally {
            if (saveWentThrough) {
                // A refusal that failed: put the install's minimum length back.
                const adminPage = await (await asUser('admin')).newPage();
                await putSite(adminPage, {minPasswordLength: INSTALL_MIN_LENGTH});
            }
            await context.close();
        }
    });
});
