// Helpers of walk.js here (issue report docs/issues/U06-A18-accept-invitation-back-typed-names-replaced.md).
// Requiring this file runs nothing. The send wizard's helpers are copied from the A15 report's
// lib.js (checks/issues/invitation-back-names-shown-not-sent), the accept wizard's from the U06
// claim check I03A (checks/U06/I03A/i03a.js), both proven on main and stable-3_5_0.
const {idle, screen, drainJobs} = require('../../../probe');

const T = 30_000;
const ROLE = {ojs: 'Copyeditor', omp: 'Copyeditor', ops: 'Moderator'};
const ACR = {ojs: 'OJS', omp: 'OMP', ops: 'OPS'};
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// --- the send wizard (manager) ----------------------------------------------------------------
const newRow = (page) => page.getByRole('row').filter({has: page.getByLabel(/^Select a new role/)}).last();

/** Settings > Users & Roles, "Invite to a role", "Search User" for `address`: lands on "Enter details". */
async function openAndSearch(page, app, address) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/access`));
    await idle(page);
    await page.getByRole('button', {name: 'Invite to a role'}).click();
    await page.getByRole('heading', {name: /Search User/}).waitFor({timeout: T});
    await idle(page);
    await page.getByLabel(/Search for a user by email address/).fill(address);
    await page.getByRole('button', {name: 'Search User', exact: true}).click();
    await page.getByRole('heading', {name: /Enter details/}).waitFor({timeout: T});
    await idle(page);
}

/** "Enter details": the names in the first (primary-language) boxes and the role row. */
async function fillInvite(page, {given, family, role}) {
    if (given) await page.getByLabel(/^Given Name/).first().fill(given);
    if (family) await page.getByLabel(/^Family Name/).first().fill(family);
    await newRow(page).getByLabel(/^Select a new role/).selectOption({label: role});
    await newRow(page).getByRole('textbox').fill(today());
    await newRow(page).getByRole('combobox').last().selectOption({label: 'Does not appear on the masthead'});
}

/** "Save And Continue", "Invite user to the role", "View All Users". Returns the dialog's text. */
async function sendInvite(page) {
    await page.getByRole('button', {name: 'Save And Continue'}).click();
    const subject = page.getByLabel(/^Subject/);
    await subject.waitFor({timeout: T});
    for (let i = 0; i < 60 && !(await subject.inputValue()); i++) await page.waitForTimeout(500);
    await idle(page);
    await page.getByRole('button', {name: 'Invite user to the role'}).click();
    const dialog = page.getByRole('dialog').filter({hasText: 'Invitation Sent'});
    await dialog.waitFor({timeout: T});
    const text = flat(await dialog.innerText(), 400);
    await dialog.getByRole('button', {name: 'View All Users'}).click();
    await page.waitForURL(/management\/settings\/access/, {timeout: T});
    await idle(page);
    return text;
}

/** The accept link of this fleet's newest invitation email to `address` sent after `since`. */
async function acceptLink(app, address, since) {
    let message = await app.fleetMail.find({to: address, since, timeoutMs: 20_000}).catch(() => null);
    if (!message) {
        await drainJobs(app).catch(() => {});
        message = await app.fleetMail.find({to: address, since, timeoutMs: 30_000}).catch(() => null);
    }
    if (!message) throw new Error(`no invitation email to ${address}`);
    const full = await app.fleetMail.fullMessage(message.ID);
    const hit = (full.HTML || '').match(/href=['"]([^'"]*\/invitation\/accept\?[^'"]+)['"]/i);
    if (!hit) throw new Error(`no accept link in the email to ${address}`);
    return {subject: full.Subject, link: hit[1].replace(/&amp;/g, '&')};
}

/** Settings > Users & Roles, the users list searched for `address`: the rows' text. */
async function memberRows(page, app, address) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/access`));
    await idle(page);
    await page.getByRole('searchbox').first().fill(address);
    await page.keyboard.press('Enter');
    await idle(page);
    await sleep(1000);
    return (await page.getByRole('row').filter({hasText: address}).allInnerTexts()).map((r) => flat(r, 300));
}

// --- the accept wizard (newcomer) -------------------------------------------------------------
async function openLink(page, link) {
    await page.goto(link);
    await page.locator('.pkpSteps, main h2').first().waitFor({timeout: T});
    await idle(page);
    await sleep(800);
}
const heading = async (page) => flat(await page.getByRole('heading', {name: /^STEP \d/}).first().innerText({timeout: 5000}).catch(() => null), 200);
const forward = (page) => page.getByRole('button', {name: 'Save and continue'});
const country = (page) => page.getByLabel(/^Country/).first();

/** "Create … account": Username, Password, the consent, "Save and continue" to "Enter details". */
async function createAccount(page, {username, password}) {
    await page.getByLabel(/^Username/).fill(username);
    await page.getByLabel(/^Password/).fill(password);
    const box = page.locator('main').getByRole('checkbox').first();
    if (!(await box.isChecked())) await box.check();
    await forward(page).click();
    await page.getByRole('heading', {name: /Enter details/}).waitFor({timeout: T});
    await idle(page);
    await sleep(500);
}

async function accountFields(page) {
    return {
        username: await page.getByLabel(/^Username/).inputValue({timeout: 3000}).catch(() => null),
        passwordLength: (await page.getByLabel(/^Password/).inputValue({timeout: 3000}).catch(() => '')).length,
        privacy: await page.locator('main').getByRole('checkbox').first().isChecked({timeout: 3000}).catch(() => null),
    };
}

/** What "Enter details" holds: the primary-language boxes (and every name box by its label). */
async function details(page) {
    const W = {timeout: 3000};
    const boxes = await page.locator('main input[type="text"], main input:not([type])').evaluateAll((els) =>
        els.filter((e) => /givenName|familyName|affiliation/.test(e.name || e.id || '')).map((e) => ({name: e.name || e.id, value: e.value})),
    ).catch(() => []);
    return {
        given: await page.getByLabel(/^Given Name/).first().inputValue(W).catch(() => null),
        family: await page.getByLabel(/^Family Name/).first().inputValue(W).catch(() => null),
        affiliation: await page.getByRole('textbox', {name: /^Affiliation/}).first().inputValue(W).catch(() => null),
        country: await country(page).evaluate((s) => (s.selectedIndex >= 0 ? s.options[s.selectedIndex].text.trim() : null), null, W).catch(() => null),
        boxes,
    };
}

/** Type what is given into the primary-language boxes; nothing is saved. */
async function typeDetails(page, {given, family, affiliation, countryLabel}) {
    if (given != null) await page.getByLabel(/^Given Name/).first().fill(given);
    if (family != null) await page.getByLabel(/^Family Name/).first().fill(family);
    if (affiliation != null) await page.getByRole('textbox', {name: /^Affiliation/}).first().fill(affiliation);
    if (countryLabel) await country(page).selectOption({label: countryLabel});
    await sleep(300);
}

async function back(page) {
    await page.locator('main').getByRole('button', {name: 'Back', exact: true}).last().click();
    await idle(page);
    await sleep(600);
}

/** "Save and continue" on "Create … account" after a "Back": lands on "Enter details". */
async function forwardToDetails(page) {
    await forward(page).click();
    await page.getByRole('heading', {name: /Enter details/}).waitFor({timeout: T});
    await idle(page);
    await sleep(800);
}

async function toReview(page) {
    await forward(page).click();
    await page.getByRole('heading', {name: /Review & create account/}).waitFor({timeout: T});
    await idle(page);
    await sleep(500);
}

/** "Accept And Continue to …": the finalize answers and the dialog; "View All Submissions". */
async function accept(page, app) {
    const answers = [];
    const onR = (r) => {
        if (/\/invitations\/\d+\/key\/[^/]+\/finalize/.test(r.url())) answers.push(r.status());
    };
    page.on('response', onR);
    await page.getByRole('button', {name: new RegExp(`^Accept And Continue to ${ACR[app.name]}`)}).click();
    const dlg = page.getByRole('dialog').filter({hasText: /assigned a new role/});
    await dlg.waitFor({timeout: T}).catch(() => {});
    const s = await screen(page);
    page.off('response', onR);
    const out = {finalize: answers, dialog: flat(s.text.dialog, 400)};
    await Promise.all([
        page.waitForURL((u) => !/\/invitation\/accept/.test(String(u)), {timeout: T}).catch(() => {}),
        dlg.getByRole('button', {name: 'View All Submissions'}).click().catch(() => {}),
    ]);
    await idle(page).catch(() => {});
    return out;
}

/** Profile > "Identity": the name boxes, every language. */
async function profileIdentity(page, app) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/user/profile`));
    await page.getByRole('heading', {name: 'Profile', exact: true}).waitFor({timeout: T}).catch(() => {});
    await idle(page);
    await sleep(800);
    const s = await screen(page);
    const boxes = await page.locator('input[name^="givenName["], input[name^="familyName["]').evaluateAll((els) => els.map((e) => ({name: e.name, value: e.value}))).catch(() => []);
    return {boxes, main: flat(s.text && s.text.main, 600)};
}

/** What the database holds for the account (Evidence only; the steps read the screens). */
function accountRow(app, sql, address) {
    try {
        return sql(app, `select u.username, u.country, (select string_agg(s.setting_name || '[' || s.locale || ']=' || s.setting_value, '; ' order by s.setting_name, s.locale) from user_settings s where s.user_id = u.user_id and s.setting_name in ('givenName','familyName','affiliation')) from users u where lower(u.email) = lower('${address}')`).trim();
    } catch (e) {
        return `ERR ${String(e.message).slice(0, 200)}`;
    }
}

module.exports = {
    T, ROLE, ACR, flat, sleep, today,
    openAndSearch, fillInvite, sendInvite, acceptLink, memberRows,
    openLink, heading, createAccount, accountFields, details, typeDetails, back, forwardToDetails, toReview, accept, profileIdentity, accountRow,
};
