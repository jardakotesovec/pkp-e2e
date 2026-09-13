// @ts-check
/**
 * @file playwright/pages/LoginSessionsPages.js
 *
 * U01 — Login & sessions, the OMP-side locators the suite needs beyond the
 * shared `LoginPage` (owned elsewhere): the Login page's "Keep me logged
 * in" box, the site-level Login page and site home, the Users & Roles
 * "Current Users" table (a Vue `<user-access-manager>`: search box, rows,
 * the per-row "More Actions" menu), the "Login As" page dialog, the
 * `login/signInAsUser/{id}` address and the two refusal pages it answers
 * with, and the cookie filter that plays a browser restart (spec fn-s).
 *
 * Function exports, the shape of `ReviewStagePages.js`; every function
 * takes the page (or a locator) it works on.
 */
const {expect} = require('@playwright/test');

const MSG = {
    accessDenied: 'The current role does not have access to this operation.',
    noAdminRights: 'Sorry, you do not have administrative rights over this user.',
    noAdminRightsCause: 'The user is active in presses you do not manage',
    confirmLoginAs:
        'Log in as this user? All actions you perform will be attributed to this user.',
};

/** The site's own home page (the press list) and its Login page. */
const siteHomeUrl = () => '/index.php/index';
const siteLoginUrl = () => '/index.php/index/en/login';

/** A press's Users & Roles screen. */
const usersScreenUrl = (contextPath) => `/index.php/${contextPath}/management/settings/access`;

/** The Login As address as the browser visits it from a users row. */
const signInAsUserUrl = (contextPath, userId) =>
    `/index.php/${contextPath}/login/signInAsUser/${userId}`;

/** The Login page's "Keep me logged in" box. */
const keepMeLoggedIn = (page) => page.getByLabel('Keep me logged in');

/** The "Current Users" table of Users & Roles. */
const usersTable = (page) => page.getByRole('table', {name: /Current Users/});

/**
 * Search the "Current Users" list (Enter commits) and wait for the list's
 * own response, so a row read afterwards is settled.
 * @returns {Promise<import('@playwright/test').Response>} the users API response
 */
async function searchUsers(page, phrase) {
    const box = page.getByRole('searchbox').first();
    await box.click();
    await box.fill('');
    await box.pressSequentially(phrase);
    const settled = page.waitForResponse((response) =>
        decodeURIComponent(response.url()).includes(`searchPhrase=${phrase}`)
    );
    await box.press('Enter');
    const response = await settled;
    await expect(usersTable(page)).toBeVisible();
    return response;
}

/** A "Current Users" row by a text it carries (a name or an address). */
const userRow = (page, text) => usersTable(page).getByRole('row').filter({hasText: text}).first();

/** Open a users row's "More Actions" menu; the items portal to the page. */
async function openUserRowMenu(page, row) {
    await row.getByRole('button', {name: /management[. ]options/i}).click();
    await expect(page.getByRole('menuitem').first()).toBeVisible();
    return page.getByRole('menuitem');
}

/** Close an open row menu by pressing its button again (never Escape near a workflow dialog). */
async function closeUserRowMenu(row) {
    await row.getByRole('button', {name: /management[. ]options/i}).click();
}

/** The "Login As" confirmation, a page dialog of the app (not a browser dialog). */
const loginAsDialog = (page) => page.locator('[data-cy="dialog"]').filter({hasText: 'Login As'});

/** The access-denied sentence of Rule 17 (the `user/authorizationDenied` page). */
const accessDeniedMessage = (page) => page.getByText(MSG.accessDenied);

/** The Rule 14 refusal for an out-of-reach user, its causes list and its way back. */
const noAdminRightsMessage = (page) => page.getByText(MSG.noAdminRights);
const noAdminRightsCause = (page) => page.getByText(MSG.noAdminRightsCause);
const usersListLink = (page) => page.getByRole('link', {name: 'All Enrolled Users'});

/**
 * The cookies a browser restart keeps: those carrying an expiry date. A
 * session-only cookie (`expires: -1`) dies with the browser.
 */
async function persistentCookies(context) {
    const cookies = await context.cookies();
    return cookies.filter((cookie) => cookie.expires > 0);
}

module.exports = {
    MSG,
    siteHomeUrl,
    siteLoginUrl,
    usersScreenUrl,
    signInAsUserUrl,
    keepMeLoggedIn,
    usersTable,
    searchUsers,
    userRow,
    openUserRowMenu,
    closeUserRowMenu,
    loginAsDialog,
    accessDeniedMessage,
    noAdminRightsMessage,
    noAdminRightsCause,
    usersListLink,
    persistentCookies,
};
