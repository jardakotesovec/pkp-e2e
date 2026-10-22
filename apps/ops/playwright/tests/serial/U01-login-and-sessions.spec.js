// @ts-check
/**
 * @file playwright/tests/serial/U01-login-and-sessions.spec.js
 *
 * Login & sessions — OPS suite, the part that cannot share the run:
 * scenario 10 (common). Scenarios 1–9 are in
 * tests/U01-login-and-sessions.spec.js, whose header lists what the suite
 * deliberately does not cover.
 * Spec: docs/specs/U01-login-and-sessions.md
 *
 * Why `@solo` (harness.md "Project chain"; patterns.md parallel lesson 2):
 * only the Site Administrator `admin` meets the Confirm Access gate, and
 * two of the scenario's answers — the wrong password's generic sentence
 * and "Your last action was not completed…" — are `admin`'s stored
 * one-time notices, fetched and deleted by the next back-office page any
 * session of `admin` loads. Every other suite that signs in as `admin`
 * could take them first, so the test runs alone in the `ops-solo`
 * project. It changes nothing site-wide when the app behaves (the
 * refused "Save" and removal are the point); a "Save" that went through
 * is put back in `finally` with the site's own save (spec footnote s).
 *
 * Seeding (footnote s): the reauth-variant server (`variants.reauth`,
 * `[security] password_timeout = 1`, PRINCIPLES D9, harness.md "The
 * reauth-variant server"), which shares the fleet's database; the
 * scratch server is made through the worker's server (`opsApi`), and
 * `admin` signs in through the variant's own Login page in a browser
 * context of its own (cookies ignore the port). The one-minute window is
 * wall time: the test waits the scenario's two minutes from the last
 * Administration request, its one wait.
 */
const {test, expect} = require('../../support/fixtures.js');
const {LoginPage} = require('../../../../../shared/playwright/pages/LoginPage.js');
const {getPassword} = require('../../../../../shared/playwright/data/users.js');
const {
    AdministrationPage,
    ConfirmAccessPage,
    CONFIRM_ACCESS_EXPIRED,
    LAST_ACTION_INCOMPLETE,
    adminNotice,
    waitPastWindow,
} = require('../../../../../shared/playwright/pages/AdminPages.js');
const {HostedJournalsPage} = require('../../../../../shared/playwright/pages/HostedJournalsPages.js');
const {SiteSettingsPage, SITE_INSTALL, putSite} = require('../../../../../shared/playwright/pages/SiteSettingsPages.js');
const {anonContext} = require('../../pages/LoginSessionsPages.js');

const GENERIC_ERROR = 'Invalid username/email or password. Please try again.';
const SEEDED_SERVER_NAME = 'Public Knowledge Preprint Server';
/** `admin` as the Confirm Access form names it (users.md: "admin admin"). */
const ADMIN = {username: 'admin', fullName: 'admin admin'};
/** Administration › "Hosted Servers"'s words (U59). */
const LABELS = {hosted: 'Hosted Servers', table: 'Servers', create: 'Create Server'};
const CLEAR_TEMPLATES_QUESTION = 'Are you sure you want to clear the cache of compiled templates?';
/** "Leave all three tabs untouched for two minutes, twice the window." */
const LEFT_OPEN_MS = 120_000;

const SITE = '/index.php/index/en';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u1${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** The pathname of the page a tab shows. */
function pathOf(page) {
    return new URL(page.url()).pathname;
}

test.describe('login & sessions (U1) — OPS, alone', () => {
    test('S10: Confirm Access before Administration, and a page left open past the window @solo', async ({browser, variants, opsApi, asUser}, testInfo) => {
        // Two minutes of the scenario's own wait plus the drive around it.
        test.setTimeout(330_000);
        const tag = makeTag('s10', testInfo);
        const serverName = `Scratch context ${tag}`;
        // A scratch server hosted beside the seeded one (Given).
        await opsApi.createContext({tag});

        const password = getPassword(ADMIN.username);
        let siteSaved = false;
        const context = await anonContext(browser, variants.reauth);
        try {
            // Site Administrator, signed in through the variant's own Login page.
            const hostedTab = await context.newPage();
            await new LoginPage(hostedTab).goto();
            await new LoginPage(hostedTab).signIn(ADMIN.username, password);
            const hosted = new HostedJournalsPage(hostedTab, LABELS);
            const gate = new ConfirmAccessPage(hostedTab);

            // Administration, not yet confirmed: Hosted Servers' address
            // shows the "Confirm Access" form instead, naming the
            // administrator; the address bar carries the interrupted page
            // (Rule 16). Nothing of Hosted Servers renders.
            await hostedTab.goto(hosted.url());
            await gate.expectForm(ADMIN.fullName);
            expect(gate.gateAddress()).toEqual({
                pathname: `${SITE}/admin/confirmAccess`,
                source: `${SITE}/admin/contexts`,
                isActionRequest: null,
            });
            await expect(hosted.rows).toHaveCount(0);

            // The Confirm Access address alone, not yet confirmed: sent
            // straight home, no form and no password asked, not into
            // Administration. With the scratch server hosted beside the
            // seeded one, home is the site's homepage listing the servers
            // (`index/index`). The form read above, the same way, is the
            // positive control of its absence here.
            await gate.gotoTrimmed();
            expect(pathOf(hostedTab)).toBe(`${SITE}/index`);
            await expect(hostedTab.getByRole('heading', {name: SEEDED_SERVER_NAME})).toBeVisible();
            await expect(hostedTab.getByRole('heading', {name: serverName})).toBeVisible();
            await expect(gate.form).toHaveCount(0);
            await expect(hostedTab.locator('input[type="password"]')).toHaveCount(0);
            await expect(hostedTab.getByRole('heading', {name: 'Administration', exact: true})).toHaveCount(0);

            // A wrong password: the form again, with the generic sign-in
            // error (Rule 2), and still nothing of Hosted Servers.
            await hostedTab.goto(hosted.url());
            await gate.expectForm(ADMIN.fullName);
            await gate.submit('not-the-password');
            await gate.expectForm(ADMIN.fullName);
            await expect(adminNotice(hostedTab, GENERIC_ERROR)).toBeVisible();
            await expect(hosted.rows).toHaveCount(0);

            // The correct password: Administration opens, on the page the
            // gate interrupted. Hosted Servers, opened from Administration,
            // shows with no password asked and lists the scratch server.
            await gate.submit(password);
            expect(pathOf(hostedTab)).toBe(`${SITE}/admin/contexts`);
            await hosted.expectOpen();
            await expect(gate.form).toHaveCount(0);
            await hosted.gotoFromAdministration();
            await expect(gate.form).toHaveCount(0);
            await expect(hosted.row(tag)).toHaveCount(1);

            // Moving between screens inside the window: a second tab on
            // Site Settings › "Site Setup" › "Security" asks no password;
            // "Minimum password length (characters)" reads 6.
            const securityTab = await context.newPage();
            const settings = new SiteSettingsPage(securityTab);
            const securityGate = new ConfirmAccessPage(securityTab);
            await settings.gotoFromAdministration();
            const security = await settings.security();
            await expect(securityGate.form).toHaveCount(0);
            await expect(security.form.getByText('Minimum password length (characters)')).toBeVisible();
            await expect(security.minPasswordLength).toHaveValue('6');

            // The Confirm Access address alone, inside the window: a third
            // tab lands on Administration instead of the form.
            const adminTab = await context.newPage();
            const adminGate = new ConfirmAccessPage(adminTab);
            const administration = new AdministrationPage(adminTab);
            await adminGate.gotoTrimmed();
            expect(pathOf(adminTab)).toBe(`${SITE}/admin`);
            await administration.expectOpen();
            await expect(adminGate.form).toHaveCount(0);
            const lastAdministrationRequest = Date.now();

            // Pages left open past the window: all three tabs untouched for
            // two minutes, twice the window (the scenario's one wait).
            await waitPastWindow(adminTab, lastAdministrationRequest, LEFT_OPEN_MS);

            // On the Security tab, 12 and "Save": refused with the sentence,
            // shown on the page as a notice (Rule 16), nothing "Saved".
            await security.minPasswordLength.fill('12');
            const saved = await security.pressSave();
            siteSaved = saved.ok();
            expect(saved.status(), 'the lapsed window refuses the save').toBe(403);
            await expect(adminNotice(securityTab, CONFIRM_ACCESS_EXPIRED)).toBeVisible();
            await expect(security.savedStatus).toHaveCount(0);

            // On the Hosted Servers tab, the scratch server's arrow,
            // "Remove" and "OK": the same answer, in the browser's alert;
            // the row stays.
            const alerts = [];
            hostedTab.on('dialog', (dialog) => {
                alerts.push({type: dialog.type(), message: dialog.message()});
                dialog.accept().catch(() => {});
            });
            // The press is read off the removal's own answer, not the
            // "Confirm" window closing: refused, the window stays open
            // behind the alert (test-ops-findings T-ops-1), and the reload
            // below clears it.
            const confirmWindow = await hosted.openRemove(tag);
            await expect(confirmWindow.question).toContainText(serverName);
            const answered = hostedTab.waitForResponse(
                (r) => r.request().method() === 'POST' && /delete-context/.test(r.url()),
                {timeout: 30_000}
            );
            await confirmWindow.button('OK').click();
            const removal = await answered;
            expect(await removal.json()).toMatchObject({status: false, content: CONFIRM_ACCESS_EXPIRED});
            await expect.poll(() => alerts, {timeout: 10_000}).toEqual([{type: 'alert', message: CONFIRM_ACCESS_EXPIRED}]);
            await expect(hosted.row(tag)).toHaveCount(1);

            // Reloading the Security tab: the "Confirm Access" form, the
            // address carrying Site Settings.
            await securityTab.reload();
            await securityGate.expectForm(ADMIN.fullName);
            expect(securityGate.gateAddress().source).toBe(`${SITE}/admin/settings`);

            // A button that reloads the page: "Delete Template Cache" on the
            // third tab, its confirmation answered: the form; the password:
            // the notice that the press was not replayed.
            const pressed = await administration.press('Delete Template Cache');
            expect(pressed.dialogs).toEqual([CLEAR_TEMPLATES_QUESTION]);
            await adminGate.expectForm(ADMIN.fullName);
            expect(adminGate.gateAddress()).toEqual({
                pathname: `${SITE}/admin/confirmAccess`,
                source: `${SITE}/admin`,
                isActionRequest: '1',
            });
            await adminGate.submit(password);
            expect(pathOf(adminTab)).toBe(`${SITE}/admin`);
            await administration.expectOpen();
            await expect(adminNotice(adminTab, LAST_ACTION_INCOMPLETE)).toBeVisible();

            // Control: reloading the Security tab asks no password, the new
            // window being open, and the minimum length still reads 6; the
            // Hosted Servers tab, reloaded, still lists the scratch server.
            // The refused changes changed nothing (Rule 16). The tab was
            // left on the Confirm Access address, which sends an open
            // window to Administration whatever page it carries
            // (test-ops-findings T-ops-2), so Security is opened from there.
            await securityTab.reload();
            await expect(securityGate.form).toHaveCount(0);
            expect(pathOf(securityTab)).toBe(`${SITE}/admin`);
            await new AdministrationPage(securityTab).expectOpen();
            await settings.gotoFromAdministration();
            await expect(securityGate.form).toHaveCount(0);
            const securityAgain = await settings.security();
            await expect(securityAgain.minPasswordLength).toHaveValue('6');
            await hosted.reload();
            await expect(gate.form).toHaveCount(0);
            await expect(hosted.row(tag)).toHaveCount(1);
        } finally {
            await context.close();
            // Never leave Site Settings changed: a save that went through is
            // put back from the worker's server, where Administration never
            // asks (footnote s).
            if (siteSaved) {
                const adminPage = await (await asUser(ADMIN.username)).newPage();
                expect(await putSite(adminPage, SITE_INSTALL.security)).toBe(200);
            }
        }
    });
});
